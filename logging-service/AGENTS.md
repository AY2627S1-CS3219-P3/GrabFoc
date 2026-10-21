# AGENTS.md — Centralized Logging Service (N2H)

Service-specific context for `logging-service/`. Read the root [`AGENTS.md`](../AGENTS.md) first: it has the product, terminology, roles, the auth model, cross-cutting rules, the plan-first rule and the **AI-agent rules** (warn before breaking them).

Tracked by issue **#52**, assigned to Cole Lin. The field convention this service depends on is [comment 6210652694](https://github.com/AY2627S1-CS3219-P3/GrabFoc/issues/52#issuecomment-6210652694) on that issue.

Status legend: **[Decided]** agreed · **[Proposed]** confirm with the owner · **[Open]** undecided.

---

## What it is

_Origin: AI doc, from the plan and the four schema answers Cole Lin gave in chat on 2026-10-16; the problems flagged below were raised by him. The shared log-line schema itself is **[Open]** and belongs to the team_

Every service already writes one JSON object per log line to stdout. Six containers means six separate logs in three shapes, with no way to follow one user action across them. This service collects those lines into one searchable store and gives an ADMIN a query API.

It is **observability, not the audit trail of record.** `location_changes` stays in the Supplier Service and commits in the same transaction as the write it describes (NFR1.5.3); this store gets a copy. A missing line here must never mean a missing audit record there.

## The line

_Origin: Team (Cole Lin's answers on 2026-10-16); the gateway's field names are Jie Yang's (#69)_

| Field | Notes |
|---|---|
| `lineId` | UUID, minted once by the producer. The primary key, so a redelivered line is a no-op |
| `ts` | **ISO-8601 UTC**, written by the emitting service. Envoy uses `%START_TIME%`, which is request *start* |
| `service` | **The service that wrote the line** |
| `level` | `debug` / `info` / `warn` / `error` |
| `event` | `access_denied`, `request_completed`, `jwks_unavailable`, and so on |
| `requestId` | The gateway's `x-request-id`. The join key |
| `userId`, `role`, `method`, `path`, `status`, `durationMs` | When the event has them |
| everything else | Kept in the `extra` JSONB column |

`path` is stored without its query string. The producer strips it and the store cuts it again at the first question mark: a location search carries the caller's coordinates, and a line that carries those also carries their `userId` (see supplier-service PR #90).

### Known problems with it

- **[Open] `service` collides with the gateway's.** Envoy sets `service` to `%UPSTREAM_CLUSTER%`, the service it routed *to*, while every other service sets it to *itself*. Pooled, a filter on `service` returns both meanings. The fix is for the gateway to emit `service: "gateway"` and rename the destination to `upstream` — cheapest while #69 is open. **Jie Yang's call.**
- **[Open] A denied request produces three lines.** Envoy's config registers a second access logger filtered on 401/403, so one 403 yields `request_completed` and `unauthorized_access` from the gateway plus `access_denied` from the service. Counting denials has to pick one source, and `unauthorized_access` and `access_denied` are two names for one concept.
- **[Open] `%START_TIME%` needs its format pinned** and verified to render in UTC. A literal Z on a local-time render is a timestamp that lies.
- The gateway's lines have **no `userId` or `role`** — they would need `payload_in_metadata` on the JWT filter. Not needed if `requestId` is the join key, but it should be a decision rather than an accident.

## Ingest **[Decided 2026-10-16]**

_Origin: Team (Cole Lin), who corrected the first proposal_

Services produce to the Kafka topic **`logging.lines`**; the **gateway stays stdout-only**.

Envoy cannot produce to Kafka — its access loggers are stdout/file, gRPC ALS and OpenTelemetry — so the alternatives were a shipper container (which contradicts building this ourselves), a gRPC ALS endpoint (real work), or leaving the gateway out. **The known gap:** the gateway's `request_completed` line, the one with the whole request's status and duration, is therefore *not* in the store. A trace covers service-to-service; the edge stays in `docker logs`. If that gap needs closing later, Envoy's OpenTelemetry access logger is the native path.

Why Kafka rather than a non-awaited HTTP POST: **buffering**. Both stay out of the request path, but if this service is down, lines wait in the topic instead of being dropped.

Kafka is at-least-once, so **duplicates are expected**, and `lineId` is what makes them harmless.

### Against the team's Kafka rules (root `AGENTS.md` §3)

Those six rules landed while this service was being written. Where it stands against each:

1. **Idempotent consumer** — yes: `INSERT … ON CONFLICT DO NOTHING` on `lineId`.
2. **Commit the offset only after the work is saved** — for the real consumer to honour (`src/ingest/consumer.ts`); `handle()` already rethrows on a temporary failure so there is something to redeliver.
3. **Commands go to the receiver's topic** — `logging.lines` is named after the receiver, as `credit.commands` is.
4. **Topics created centrally** — **[Open]**, see below.
5. **Keyed by the entity whose order matters** — `requestId`, set by the shipper, so one request's lines stay in one partition and in order. A line with no request (startup, purge) is unkeyed; it has no sequence to preserve.
6. **A dead-letter topic per consumer** — **deliberately not done.** A rejected log line is already on the producer's stdout, so nothing is lost by dropping it; and unlike a credit command, replaying it is pointless — it failed validation, so it would fail again identically. The rule's own reason ("one message can fail for one consumer and succeed for another") does not apply either, because this topic has exactly one consumer. **Jian Bing owns the rule, so this exception is his to accept or refuse** — if he refuses, the change is a `logging.lines.dlt` line in `topics.txt` and a produce call in `reject()`.

Rule 6 did, however, surface a real bug, now fixed. A line the database will **never** accept — a constraint or data error, SQLSTATE class 22 or 23 — used to be rethrown, so the broker would redeliver it forever and hold every other service's logging behind it. Those are now dropped and counted like a malformed line; only a *temporary* failure (a dropped connection, a server shutting down, too many clients) is rethrown for redelivery.

**[Open]** `logging.lines 3` must be added to `infra/kafka/topics.txt` — services never create topics (#75). **Jian Bing's file**, and nothing produces to the topic until a publisher is wired into the shipper, so it has not been added yet. The `x-request-id` message header must also survive republication to the retry topics and the dead-letter topic (#77, #78), and an admin **replay** needs a rule: keep the original `x-request-id` and record the replaying admin's separately, or one of the two traces is lost.

## Schema

_Origin: AI doc, from the table Cole Lin approved on 2026-10-16_

See [`src/db/schema.ts`](src/db/schema.ts), created at startup like the Supplier Service's. One table, `log_lines`, plus `received_at` — when this store got the line, so the gap is broker lag and a negative gap is clock skew. Indexes: `request_id`, `ts DESC`, `(service, event, ts DESC)`, `(user_id, ts DESC)`.

Retention: **30 days** (`LOGGING_RETENTION_DAYS`), purged hourly, measured by **`received_at`** rather than the producer's `ts`: a producer can put any timestamp on a line, and purging on `ts` kept a line dated a year ahead for thirteen months. Deliberately shorter than the 90 days the root AGENTS.md gives `location_changes`, because these rows put a user id, a path and a timestamp in one place.

## API

_Origin: AI doc, following the Supplier Service's conventions_

| Method and path | Access |
|---|---|
| `GET /logs` with `requestId`, `service`, `event`, `userId`, `level`, `status`, `from`, `to`, `page`, `pageSize` | **ADMIN only** |

- **ADMIN only, with no dev-auth fallback.** The Supplier Service accepts `X-User-Id` / `X-User-Role` when `SUPPLIER_DEV_AUTH=true` so it can be tested alone; this service has no such mode, because pooled rows say which user called which path and when. A USER gets **403** — not even for their own lines, which would still expose the rest of each line.
- Unknown filters are rejected (**400**), not ignored: a typo is a typo, not a wildcard. `page` is
  bounded as well as positive, because an offset larger than PostgreSQL's integer range would
  surface as a 500 on an otherwise valid query.
- **A line is never dropped because its `requestId` looks odd.** The pattern a service applies
  to an inbound header decides what it will *use*; this store records what happened, and
  refusing the line would make an `access_denied` event disappear — which is what a caller
  sending a strange header would want. Control characters and anything over 200 characters are
  still refused.
- `pageSize` is capped at 200. Newest first, with `line_id` breaking ties so a page boundary is stable when several lines share a millisecond.
- Errors are Problem Details (RFC 9457), the same shape as every other service. 401, 403 and 503 match the Supplier Service exactly, including 503 when the JWKS cannot be reached.

## The shipper every service copies

_Origin: AI doc, from the plan Cole Lin approved_

[`src/client/log-shipper.ts`](src/client/log-shipper.ts) is the canonical copy. This repository has no shared package, so **copy** it to `<service>/src/common/log-shipper.ts` rather than importing across folders — and when it changes here, change it there. It lives under `src/` so `npm test` covers it; the Logging Service itself does not use it.

- It takes no Kafka client. A `LinePublisher` is handed in, so a service adopts `@confluentinc/kafka-javascript` (the client Credit pinned in #85) only when there is a broker to talk to.
- **No broker configured means stdout only**, with no producer and no warnings. The Supplier Service's standalone Postman testing depends on that.
- `emit()` returns immediately, buffers up to 1000 lines, and **drops rather than blocking** when the buffer is full or a publish fails. Dropping is acceptable because the line reaches stdout regardless, and the same `lineId` is on both, so re-reading stdout later cannot double-count.
- Each message is **keyed by `requestId`** (Kafka rule 5), so one request's lines keep their order.
- **Sensitive field names are matched as substrings and replaced at any depth** (so `adminToken` and `customerEmail` go too, and it over-redacts rather than under-redacts), so a caller passing `password`, a `token`,
  or `{ request: { headers: { authorization } } }` cannot write it to stdout or Kafka. The store
  does the same on ingest; this is the only guard on the stdout copy.
- **A caller cannot overwrite the envelope.** Their fields are serialised first, so `lineId`,
  `ts` and `service` always win — a line claiming another service's name would make the store
  unreadable.
- It writes the line itself rather than through Nest's logger, which would wrap the JSON in Nest's own timestamp, PID and context and leave a collector digging it out.

**Adopted by:** the Supplier Service (`supplier-service/src/common/log.ts`), whose `access_denied`, `jwks_unavailable` and `unhandled_error` lines now go through it.

## Pending

- The real Kafka consumer. `src/ingest/consumer.ts` is the seam; nothing provides it until #75. With `LOGGING_KAFKA_BROKERS` set and no consumer, startup says so and the query API still runs.
- Services adopting the shipper: Supplier **done**. Then User (the rewrite landed in #125, so this is now a retrofit), Order (#119 landed too), Credit (#85, which already has the client). Each is its owner's to copy in; the file is ~130 lines and needs no dependency.
- **[Open]** Nest's logger prefixes its own timestamp, PID and context, so the JSON object is the *message*, not the whole line, and a collector has to dig it out. `ConsoleLogger({ json: true })` makes it worse, nesting our JSON inside Nest's own envelope. The shipper sidesteps this by writing the line itself, which is the proposed answer for every service.
- **[Open]** Where logs surface in the UI: a page in Zi Yi's admin dashboard, or a screen here.
- No `location_changes` import. That table stays in the Supplier Service (root AGENTS.md open item).

## Tests

```bash
npm test
npm run test:int
```

`npm test` is offline. `npm run test:int` needs the database container:

```bash
docker compose -f logging-service/compose.yaml up -d logging-db
```

The integration tests use their own `logging_test` database in that container, created and emptied by the tests themselves. If `LOGGING_POSTGRES_PASSWORD` is set in your root `.env` but the container was first started without it, the password stored in the volume will not match and every integration test fails with "password authentication failed" — bring the container up from the root `compose.yaml`, or change the stored password to match.
