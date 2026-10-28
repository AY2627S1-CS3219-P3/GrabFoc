<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), dates: 2026-10-16 to 2026-10-27
Scope: Wrote this document from the plan and the four schema answers Cole Lin gave in chat on
  2026-10-16, and kept it in step with each review round on PR #129. The decisions it records are
  his; the wording is Claude's. Where a section records a problem rather than a decision, he raised
  it. The per-section "Origin" notes say which is which.
Author review: Cole Lin, read and approved.
-->

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
6. **A dead-letter topic per consumer** — yes: `logging.lines.dlt`, listed in `infra/kafka/topics.txt` beside Credit's. A line this service cannot store is parked there as well as counted, with the same headers Credit uses (`x-source-topic`, `x-source-partition`, `x-source-offset`, `x-error`, `x-dead-lettered-at`) so one admin screen can read every service's dead letters, plus the inbound `x-request-id` so the dead letter can still be tied to the request that caused it.

   **The parked body is the payload's shape, not its contents** (PR #129 review), on both park paths — a line that failed validation and a line the store refused with a permanent error. The second one is not stored anywhere, so the dead-letter topic would otherwise be the only place its values live. A rejected line has not been through `toRow`, so parking it verbatim would put a `password` in a topic an admin screen reads. Name-based redaction is not enough on this path either: a line fails validation *because* a field held something unexpected, and `role: "Bearer eyJ..."` passes a name filter untouched. So the body carries field names and value types only — `{"lineId":"string(10)","role":"string(96)"}` — which is what a dead letter is actually read for. When the message did not parse at all, or parsed to something that is not an object, no body is parked: there are no field names to describe. The raw message stays in the source topic for Kafka's retention, which is where to look if the redacted copy is not enough. A park that fails is rethrown, so the offset is not committed and the broker redelivers: a line that is neither stored nor parked is the one outcome worth avoiding.

   **Ingest refuses to consume at all without a dead-letter sink** (PR #129 review). The consumer
   and the sink are both `@Optional()` providers, so a consumer wired in without a sink is a
   configuration this service can be handed — and in it, `reject()` has nowhere to park a message
   it cannot store, so `handle()` resolves, the offset is committed, and the line is gone from the
   pipeline: the one outcome the paragraph above exists to prevent. Startup now logs an error and
   leaves ingest off, so lines wait in `logging.lines` for Kafka's retention and the query API
   still comes up — the same shape as the missing-consumer case. `reject()` keeps its own guard,
   because `handle()` is public and must not throw on a missing sink.

   _An exception was argued for first — a rejected log line is already on its producer's stdout, and replaying one that failed validation fails identically — and **Cole Lin decided against it on 2026-10-21**: every service should behave as its own microservice, and one consistent rule across five services is worth more than saving a topic here. Recorded because the reasoning matters more than the outcome._

Rule 6 did, however, surface a real bug, now fixed. A line the database will **never** accept — a constraint or data error, SQLSTATE class 22 or 23 — used to be rethrown, so the broker would redeliver it forever and hold every other service's logging behind it. Those are now dropped and counted like a malformed line; only a *temporary* failure (a dropped connection, a server shutting down, too many clients) is rethrown for redelivery.

`logging.lines 3` and `logging.lines.dlt 1` are in `infra/kafka/topics.txt`. That file is **Jian Bing's**, so those two lines want his eye even though the convention there is "add a topic by adding a line". The `x-request-id` message header must also survive republication to the retry topics and the dead-letter topic (#77, #78), and an admin **replay** needs a rule: keep the original `x-request-id` and record the replaying admin's separately, or one of the two traces is lost.

## Schema

_Origin: AI doc, from the table Cole Lin approved on 2026-10-16_

See [`src/db/schema.ts`](src/db/schema.ts), created at startup like the Supplier Service's. One table, `log_lines`, plus `received_at` — when this store got the line, so the gap is broker lag and a negative gap is clock skew. Indexes: `request_id`, `ts DESC`, `(service, event, ts DESC)`, `(user_id, ts DESC)`, and `received_at` — the purge filters on arrival, so without that one the hourly run scans the whole table.

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
- **There is no health endpoint.** The guard is global, so nothing here answers without a token; `GET /logs` answering at all (401, or 503 when the JWKS is unreachable) is the liveness signal, and Compose's healthcheck is on the database. The README used to claim one existed (PR #129 review). **[Open]** a liveness route is a convention for all six services and belongs to the team.
- Errors are Problem Details (RFC 9457), the same shape as every other service. 401, 403 and 503 match the Supplier Service exactly, including 503 when the JWKS cannot be reached **or returns a key set this service cannot use** — an empty array, or one holding a non-object. Answering 401 there would tell a valid administrator their token is bad when the truth is that we cannot check it, and would leave the cache empty so every later request refetched.
- The database pool listens for its own `error` event. Without that, a routine PostgreSQL restart ends an idle connection, Node treats the event as uncaught and the service exits — taking ingest and the query API with it, and this Compose setup has no restart policy to bring it back.

## The shipper every service copies

_Origin: AI doc, from the plan Cole Lin approved_

[`src/client/log-shipper.ts`](src/client/log-shipper.ts) is the canonical copy. This repository has no shared package, so **copy** it to `<service>/src/common/log-shipper.ts` rather than importing across folders — and when it changes here, change it there. It lives under `src/` so `npm test` covers it; the Logging Service itself does not use it.

- It takes no Kafka client. A `LinePublisher` is handed in, so a service adopts `@confluentinc/kafka-javascript` (the client Credit pinned in #85) only when there is a broker to talk to.
- **No broker configured means stdout only**, with no producer and no warnings. The Supplier Service's standalone Postman testing depends on that.
- `emit()` returns immediately, buffers up to **1000 lines and 4 MB**, and **drops rather than blocking** when either bound is reached or a publish fails. A single line over **64 KB** goes to stdout and is never buffered, counted apart as `oversize`. A line count alone was not a bound: a thousand lines of megabyte metadata is a gigabyte held by the one component whose job is not to disrupt the service it logs for (PR #129 review). Dropping is acceptable because the line reaches stdout regardless, and the same `lineId` is on both, so re-reading stdout later cannot double-count.
- Each message is **keyed by `requestId`** (Kafka rule 5), so one request's lines keep their order.
- **Sensitive field names are matched as substrings and replaced at any depth** (so `adminToken` and `customerEmail` go too, and it over-redacts rather than under-redacts), so a caller passing `password`, a `token`,
  or `{ request: { headers: { authorization } } }` cannot write it to stdout or Kafka. The store
  does the same on ingest; this is the only guard on the stdout copy.
- **The page query does not materialise the table.** The predicate is written into both the count
  and the page subquery rather than into one `filtered` CTE they share. PostgreSQL materialises a
  CTE referenced more than once, so the shared version built every matching row — `extra` JSONB
  included — sorted the lot, and then returned fifty of them; on an unfiltered page, which is how
  an admin screen opens, that is the whole table in a temporary result. Each subquery reads
  `log_lines` once now, so the count can go index-only and the page can stop early on
  `ix_log_lines_ts`. Both still see one snapshot, because a snapshot belongs to the statement and
  not to the scan — which is the only thing the single statement was ever for (PR #129 review).
- **One statement for a page and its total.** The rows and the count come from a single query — a count CTE left-joined to the page CTE — so they always describe the same instant. `count(*) OVER ()` could not report a total for an empty page, and a fallback count query fixed the number by reintroducing exactly the race it replaced: a line inserted between the two statements gave `lines: []` with `total: 1` (PR #129 review). An empty page therefore comes back as one row carrying the total with `line_id` NULL, which the service filters out rather than reading as a line.
- **Every text field obeys one rule on both sides.** `service`, `event`, `userId` and `requestId` reject control characters on **ingest** as well as in the query filter. Hardening only the filter left a line whose `userId` held a tab storable and then unsearchable through the very filter an admin would reach for (PR #129 review).
- **Every field the store bounds is bounded here first.** `inboundLineSchema` caps `service` at
  40 characters, `event` at 60, `requestId` at 200, `userId` at 100, `method` at 10 and `path` at
  400, fixes `status` to 100–599 and `durationMs` to the `INTEGER` range, and admits only its two
  enums for `level` and `role`. A value outside any one of them does not cost the field — it costs
  the **whole line**, because the schema rejects the line and ingest parks it. So a caller who
  controls one field could keep a line out of the searchable store while leaving it on the
  producer's stdout, where nobody queries: a 500-character URL did exactly that to an
  `access_denied` line (PR #129 review). The round before swept the *query filter* against the
  store; this is the *producer* against the store — the same pairing from the other side, and the
  one that had never been checked.
  - **A line this schema calls valid has to be a line the columns can hold.** `method` and `path`
    were the only two text fields declared as a bare `z.string()`; every other one goes through
    `plainText`, which refuses control characters. So a NUL in a path passed validation and then
    failed the `INSERT` with a class-22 `SQLSTATE`, which `unstorable()` reads as permanent — so
    ingest parked a line this schema had just called valid, and the round-trip to the database was
    wasted finding out. Both now go through `plainText`; `path` through a variant without the
    minimum length, because the shipper strips control characters and so a path made only of them
    arrives as `''`, which `toRow` turns into NULL. Same defect as the `durationMs` bound, same
    fix (PR #129 review).
  - **`extra` is JSONB, and JSONB has bounds of its own.** It cannot represent a NUL or an unpaired
    surrogate: PG text holds no NUL at all, and a lone surrogate arrives as a `\ud800` escape its
    JSON parser refuses. Either one costs the whole line, exactly as an over-long `path` did — the
    insert fails with a class-22 error, which ingest reads as permanent and parks. Both are
    *removed* here rather than rejected, and the other way round from the envelope fields, because
    `extra` is free-form metadata: a tab or a newline in a `note` is content and is kept, and losing
    one character costs less than losing the line. Stripped in the shipper too, so stdout and the
    stored row say the same thing (PR #129 review).
  - **An array is rebuilt by index, never with the caller's `map`.** `Array.prototype.map` goes
    through `Symbol.species`, so mapping a subclass returned another instance of that subclass —
    prototype and all — and `JSON.stringify` then called its inherited `toJSON` *after* redaction
    had finished, free to return a token from an innocuous-looking array. Dropping own function
    values does not help: a class puts `toJSON` on the prototype, where `Object.entries` never
    looks. Reachable from a caller in the shipper; in `line.schema.ts` every value came from
    `JSON.parse`, so the same change there is defensive and `redactDeep` is exported
    (PR #129 review).
  - `event` and `path` are **cut and marked** with `[TRUNCATED]` inside the bound, because the
    leading characters are the informative part and a reader searches by them.
  - `requestId`, `userId`, `method`, `role`, `status` and `durationMs` are **left out** instead:
    an id cut to length is some other request's id, or some other student's, and an absent field
    is honest where a wrong one reads as fact. A control character drops an id for the same reason
    — `trace<TAB>1` with the tab taken out is `trace1`, which may belong to someone else.
  - A `level` outside the enum becomes `error`, not `info`: a line nobody can explain is worth a
    reader's attention rather than burial.
  - `service` is checked in the **constructor**. A name outside the bound makes every line that
    service will ever write unstorable, so it fails at startup — the one place that can say so —
    rather than per line, where `emit()` may never throw.
  - A clamped line increments `counts.clamped`. It is the only remaining trace that some producer
    is handing the store values it will not take, now that the line itself goes on without them.
    Stripping the query string is this shipper's own rule, not a store bound, so it does not count.
  - The spec checks a shipped line against `inboundLineSchema` **itself**, not against a copy of
    these numbers, so a bound added to the schema and forgotten here fails a test instead of
    quietly costing lines. Only the spec imports it; the shipper is copied into every service and
    stays free of logging-service imports.
- **Field *names* are sanitised as well as values.** Redaction only ever looked at values, so
  data used as a key — `{ recipients: { "alice@nus.edu.sg": true } }` — travelled untouched
  into stdout, Kafka and the `extra` column (PR #129 review). A name outside
  `[A-Za-z0-9_.:-]{1,64}` is replaced whole by its position and length, not truncated, since
  half an address is still half an address. The value under it is kept. The same rule is in
  the shipper, in `line.schema.ts` and in the dead-letter shape, and **the three must agree**.
  `__proto__` is replaced too, although it matches the pattern: it is the one name for which
  `out[key] = value` does not define a property but runs `Object.prototype`'s setter, so the
  field was dropped while every neighbour survived — a silent loss from a record kept for audit
  (PR #129 review). All three walkers also build their output with a **null prototype**, so that
  loss is structurally impossible rather than dependent on the name list staying right. The
  name is replaced as well as the prototype dropped because the inbound schema's own object is
  built by Zod, which *does* drop that key: a line keeping the name on stdout and losing it in
  the store is the kind of disagreement these reviews keep finding.
- **The redaction list covers personal data, not only credentials.** `phone` and display, given
  and family names were outside it, so a profile line put a student's name in the clear into
  stdout, Kafka and the `extra` column (PR #129 review). `name` on its own is *not* in the list:
  it would take `eventName` and the location labels, which are public catalogue data.
- **A caller cannot overwrite the envelope.** Their fields are serialised first, so `lineId`,
  `ts` and `service` always win — a line claiming another service's name would make the store
  unreadable.
- It writes the line itself rather than through Nest's logger, which would wrap the JSON in Nest's own timestamp, PID and context and leave a collector digging it out.
- **A safe-looking key is not a safe key, and nothing here can make it one.** `safeKey` replaces a
  field name that *cannot* be a field name — one with an `@`, a space, 200 characters — because such
  a name is data rather than a name. A review round asked for credential-*shaped* keys to be
  replaced as well, and it is right that `{ attempts: { "123456": true } }` writes a six-digit code
  verbatim. There is no fix at this layer: nothing distinguishes that key from
  `{ byStatus: { "404": 3 } }` or `{ byYear: { "2026": 5 } }`, which are ordinary aggregates, and
  redaction matches *names*, so it cannot identify a secret by its contents — in a key no more than
  in a value. What does help is the call-site rule in root AGENTS.md: never log an OTP or a handover
  code, as a value or as a field name. `otp` and `code` are both in the name list, so the usual
  shapes are caught by the parent key. **Left open on the PR** for the team rather than resolved
  (PR #129 review).
- **`event` is a fixed name, never text built from a request.** It is an envelope field, so it is
  the one field redaction cannot help with: `redactFields` matches field *names*, and the value of
  `event` is written through on the ordinary path and echoed as `originalEvent` on the
  `line_unserialisable` path alike. A review round read the fallback as a leak of its own and asked
  for the field to be dropped there; it is not a leak of its own — the ordinary path carries the
  same value to the same two places, stdout and the topic — and dropping it would cost the only
  thing that line says, which is *which* event could not be built. The real rule is the one above,
  and it is a call-site rule: an `event` interpolated with caller data leaks on every line, not
  just the failed ones. It is written on `LineInput.event` so it is read where calls are made.
  **Left open on the PR** rather than resolved, so the team can arbitrate (PR #129 review).
- **`emit()` cannot throw.** Redaction and serialisation both sit inside one guard, because reading a caller's fields can itself throw — an enumerable getter or a Proxy trap runs during `Object.entries`. If the body cannot be built, a `line_unserialisable` line is written with the envelope and the original event name, so the failure is visible rather than silent. **The local write is guarded too** (PR #129 review). It was the one statement outside that guard, and it is not a safe one: `write` is a documented option, so it is caller-supplied code, and the default is no better — stdout in a container is a pipe, a pipe write is synchronous on Linux, and a reader that goes away raises `EPIPE` on the caller's own stack. "Fire and forget" covers the *broker*, which is buffered and never awaited; the stdout write is an ordinary synchronous call in the request's stack, so a dead sink turned the request it was logging into a 500 — the component whose whole purpose is not to disturb the service it logs for taking that service down. It is counted as `writeFailed` rather than reported, because there is nowhere to report a broken log sink *to*, and the line is still buffered for the broker afterwards: a broken local sink is a reason to ship harder, not to stop, since the topic is then the only copy.
  **The two other caller-supplied parts of the options are guarded as well** (PR #129 review). `newId` sat in the same statement as the local write, one argument along, and ran *before* `build()`, so an exception from it escaped `emit()` altogether; the default `randomUUID` stands in and `counts.idFailed` says it happened, because the store refuses a line with no id and losing the line would be the worse of the two failures. `flushMs` is refused at construction unless it is a whole number `setInterval` can actually schedule: anything else — larger than the signed 32-bit limit, fractional, zero, `NaN` — is silently reduced to about 1 ms, which with a publisher wired in is a flush loop for the life of the process. The constructor is allowed to fail where `emit()` is not, so this is a throw rather than the clamp `PurgeService` uses for the same hazard on an environment variable.
  **The validated service name is held, not reread** (PR #129 review). It was checked once in the constructor and then read from the caller's own object per line, so mutating `options.service` afterwards misattributed every later line, or made every later line unstorable, without passing that check again.
  **The fallback line carries the `requestId` too** (PR #129 review). It is the only record that a log call failed, and it had none — so in the one service whose purpose is following a request across services, the gap it left in a trace read as a line nobody wrote rather than a line that was lost. `input.requestId` is read in its own `try` exactly as `input.event` already was, and bounded by `boundedId`, which returns `undefined` rather than throwing and so cannot be the reason this line fails as well. It is the Kafka key as well, so the failure lands in the partition already holding that request's lines.

**Adopted by:** the Supplier Service (`supplier-service/src/common/log.ts`), whose `access_denied`, `jwks_unavailable` and `unhandled_error` lines now go through it.

## Pending

- The real Kafka consumer. `src/ingest/consumer.ts` is the seam; nothing provides it until #75. With `LOGGING_KAFKA_BROKERS` set and no consumer, startup says so and the query API still runs — and a consumer provided **without** a `DEAD_LETTERS` sink is refused the same way, rather than consuming and committing the offset of messages it cannot park.

  **Whoever writes it owes one thing: await the handler, and on a rejection leave the offset uncommitted** (root AGENTS.md §3, rule 2). The contract is now on `MessageHandler` itself rather than only in `IngestService`'s comments, because `handle()`'s own docstring used to say it "never throws" — which it does, deliberately, when the failure is ours rather than the message's: the store briefly unreachable, or the park itself failing. Everything the service can judge is counted and parked instead. A consumer that catches the rejection and commits anyway drops every line written during a database restart, with nothing but `counts.failed` to say so, and "never throws" is the one sentence that would have made writing such a consumer reasonable (PR #129 review).
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
