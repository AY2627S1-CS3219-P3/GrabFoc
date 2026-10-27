<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
Scope: Added the "every request, not only the failures" section and the request_completed row to
  the event table, from Cole Lin's decision of the same day (issue #52). Earlier AI-assisted
  changes to this file are recorded per section in its _Origin:_ lines.
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
Scope: Recorded the JWKS filtering and the bounded list filters in the Auth section
  (swept from the PR #129 review).
Author review: Cole Lin, read and approved.
-->
# AGENTS.md — Supplier (Location) Service

Service-specific context for `supplier-service/`. Read the root [`AGENTS.md`](../AGENTS.md) first: it has the product, terminology, roles, the auth model, cross-cutting rules, the plan-first rule and the **AI-agent rules** (warn before breaking them).

Status legend: **[Decided]** · **[Proposed]** · **[Open]** (defined in the root `AGENTS.md`).

**Scope for now:** simple CRUD on locations. Change history is pending (see Rules).

**Implementation [Decided]** · _Origin: Team_
- NestJS (TypeScript, Node.js), PostgreSQL through `pg` with plain parameterized SQL, strict Zod validation.
- JSON field names are the same as the columns (`id`, `name`, `type`, `building`, `floor`, `location_desc`, `lat`, `lon`, `image_url`, `status`, `version`), except the hours: `open_time` / `close_time`, as `HHMMhrs` strings (stored as minutes in `open_min` / `close_min`).
- **Auth [Decided]:** every request carries a bearer token issued by the User Service. The gateway verifies it and forwards it unchanged; **this service verifies it again** against the User Service's JWKS (`SUPPLIER_JWKS_URL`) rather than trusting the network, then takes the caller from the `sub` and `role` claims. RS256/ES256 only, `exp` and `nbf` enforced, `iss`/`aud` checked only when configured (same as the gateway). Keys are cached for 5 minutes and refetched on the **first** unknown `kid`, with repeat misses rate-limited to one refetch per 30 s — the miss is recorded only once the endpoint answers, so a failed refetch does not hold off the retry. A key the service could not verify with (no `kid` or `kty`, `use` other than `sig`, an alg outside RS256/ES256, or one `crypto` cannot import) is **filtered out when the set is fetched**; a set with nothing usable left is treated as unreachable. Missing or invalid token → **401**; wrong role → **403**; JWKS unreachable, or holding nothing verifiable → **503**, because 401 would tell a valid administrator their token was bad.
- **Text list filters are bounded and reject control bytes.** `?name=`, `?type=` and `?building=` are capped at the column's own 100 characters, and a NUL or other control byte is a **400**: PostgreSQL cannot carry a NUL in a TEXT parameter, so it used to reach the query and come back as a 500.
- **Local testing only:** with `SUPPLIER_DEV_AUTH=true` the service falls back to `X-User-Id` / `X-User-Role` headers **when no bearer token is sent**, so it can be tested without the User Service. A real token is always verified, so the headers can never override or downgrade one. The flag is off by default, startup refuses it when `NODE_ENV=production` (which the Dockerfile sets), and it logs a warning at startup when on.
- Run and test instructions: `README.md`. Postman collection: `postman/supplier.postman_collection.json`.

**Why PostgreSQL [Decided]** · _Origin: Team_
- The data is **structured**: every location has the same fields.
- Query patterns are paginated listing plus filter and sort (by type, building, name, opening/closing time), with parameterized queries.

**Rules** · _Origin: Team (Backlog SUFR1–5 and team decisions)_

- Admin-only create, update, deactivate and restore. Any authenticated user can list and look up.
- Deletion is **soft**: the location is set `INACTIVE` and the row kept, so old orders can still show their pickup point.
- Listing returns `ACTIVE` locations only by default. Results are ordered by `name`, A→Z by default; the caller can ask for Z→A with `order=desc`. Ordering by type or building (backlog S2.2.2) is **PENDING**.
- **Inactive locations:** admins see them on a separate admin dashboard, which uses the same `GET /locations` endpoint with `?includeInactive=true`. If a USER sends `includeInactive=true`, the service checks the token, finds the user isn't authorised, returns **403** and logs the attempt.
- `name` must be unique among `ACTIVE` locations, compared case-insensitively (backlog S1.2.2, which calls it the display label). It is at most 100 characters.
- Coordinates must fall inside the configured campus boundary (S1.2.3).
- **Stale updates (S3.3.3):** each location has a version number. An update sends the version it loaded; if the location has changed since, the update is rejected. Updates, deactivate and restore all raise the version. A `PATCH` with no fields besides `version` changes nothing: 200 with the location unchanged, version not raised (409 if that `version` is out of date).
- Inactive locations can still be updated with `PATCH`.
- **Fewer ID gaps:** create checks for an unknown type and a duplicate ACTIVE name before inserting, so those failures don't use up an ID. Rare failures (e.g. two admins creating the same name at once) can still leave a gap.
- If the seed file ever fails validation, nothing is loaded, the error is logged and the service keeps running (the current seed file passes).
- **Operating hours** are optional, but opening and closing time are **both present or both absent**; an update must send them together. They are stored as **minutes since midnight** (`open_min`, `close_min`). Admins enter them, and searches use them, in the CSV's `HHMMhrs` format (e.g. `0900hrs`), which the service converts (`0900hrs` → 540). There is no other check: a closing time earlier than the starting time is allowed (closes after midnight).
- **Location types** are a separate table holding the seed CSV's types: `Food`, `Food/Coffee`, `Printing`, `Shopping`. Admins cannot add new types.
- **Change history is pending.** Recording prior and new values (SUFR3.3) is not part of the first version.
- **Seed data** loads on startup only when there are no locations yet. It is all-or-nothing (S5.2.2).

## Seed data

_Origin: Restated from the Brief (M3) and the template's seed file (facts checked by AI); Team (loading rules)_

The seed comes from the **professor's template repository**: `data/csv/supplier-seed-data.csv` (21 rows), with images in `data/images/`. Because the load is all-or-nothing, one row that fails validation blocks the whole seed.

| CSV column | Stored as | Loading rule |
|---|---|---|
| `Name` | `name` | |
| `Type` | `type` | Stored as the CSV value (`Food`, `Food/Coffee`, `Printing`, `Shopping`) |
| `Building` | `building` | |
| `Floor` | `floor` | Present in every row |
| `Location Description` | `location_desc` | |
| `Latitude`, `Longitude` | `lat`, `lon` | Stored at the CSV's precision (up to 9 decimal places) |
| `StartingTime`, `ClosingTime` | `open_min`, `close_min` | Converted from `HHMMhrs` to minutes since midnight (`0900hrs` → 540) |
| `ImageURL` | `image_url` | Empty in 15 of 21 rows: store no image. The rest are `github.com/<owner>/<repo>/blob/<branch>/<path>` page links; rewrite them to `raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` so they point at the image itself |

- **Encoding:** the file is **Windows-1252**, not UTF-8 (it contains curly apostrophes). Decode it as `cp1252`, or a UTF-8 reader will crash or corrupt those characters.
- **IDs:** seeded locations get IDs the same way as any new location (generated by the database).
- **Creator:** seeded locations have no creator (`null`) once the creator column is added (pending).
- **Campus boundary:** the seed spans latitude 1.2904–1.3006 and longitude 103.7526–103.7794. The configured boundary must include these, or S1.2.3 rejects rows and the seed fails.

## Schema

_Origin: Team (tables, columns and types); required fields follow backlog S1.1.1–S1.1.2_

```sql
CREATE TABLE location_types (
    type  TEXT PRIMARY KEY
);
INSERT INTO location_types (type) VALUES ('Food'), ('Food/Coffee'), ('Printing'), ('Shopping');

CREATE TABLE locations (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           TEXT NOT NULL CHECK (char_length(name) <= 100),   -- S1.2.2
    type           TEXT NOT NULL REFERENCES location_types(type),
    building       TEXT NOT NULL,
    floor          INTEGER NOT NULL,
    location_desc  TEXT NOT NULL,
    lat            NUMERIC(11,9) NOT NULL,   -- CSV precision: up to 9 decimal places
    lon            NUMERIC(12,9) NOT NULL,   -- CSV precision: up to 9 decimal places
    open_min       SMALLINT CHECK (open_min BETWEEN 0 AND 1439),    -- optional (S1.1.2); minutes since 00:00
    close_min      SMALLINT CHECK (close_min BETWEEN 0 AND 1439),   -- optional (S1.1.2)
    image_url      TEXT CHECK (image_url IS NULL OR image_url ~* '^https?://'),
    status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    version        INT  NOT NULL DEFAULT 1
    -- PENDING: created / last-modified timestamps and creator (S1.3.1, S1.3.2, S2.3.2)
);

-- name is unique among ACTIVE locations, compared case-insensitively (S1.2.2)
CREATE UNIQUE INDEX uq_locations_active_name ON locations (lower(name)) WHERE status = 'ACTIVE';
```

## API [Decided]

_Origin: Team_

| Method & path | Access |
|---|---|
| `GET /locations` | any authenticated user; `includeInactive=true` is ADMIN only (403 otherwise) |
| `GET /location-types` | any authenticated user |
| `GET /locations/:locationId` | any authenticated user (returns `INACTIVE` too) |
| `POST /locations` | ADMIN |
| `PATCH /locations/:locationId` (body includes the version) | ADMIN |
| `POST /locations/:locationId/deactivate` | ADMIN |
| `POST /locations/:locationId/restore` | ADMIN |

**`GET /locations` response:** a wrapped object, `{ "items": [...], "page": 1, "pageSize": 20, "total": 21 }`, so the UI can show numbered pages. When `lat`/`lon` are given, each item also carries **`distance_m`**, whole metres from that coordinate (great-circle distance, mean Earth radius 6 371 km, computed in SQL so the database can order by it). Without a coordinate the field is absent.

**Query parameters for `GET /locations`:**

| Parameter | Matching |
|---|---|
| `name` | case-insensitive substring match on `name` (matches anywhere, not just the start) |
| `type` | exact match |
| `building` | exact match |
| `time` | open at that time, in `HHMMhrs` format (rule below) |
| `includeInactive=true` | also return `INACTIVE` locations (ADMIN only) |
| `lat`, `lon` | the caller's coordinate in decimal degrees, as a phone's GPS reports it (e.g. `lat=1.296600&lon=103.776400`). Must be given together; they filter nothing, they add `distance_m` to each item |
| `order` | `asc` (default, A→Z) or `desc` (Z→A) on `name`, or `distance` (nearest first, needs `lat`/`lon`); any other value is 400 (S2.2.3) |
| `page`, `pageSize` | paging, e.g. `?page=2&pageSize=20`; defaults `page=1`, `pageSize=20`; no upper limit on `pageSize` |

Name search, as a parameterized query:

```sql
lower(name) LIKE '%' || lower(:q) || '%'
```

Searching by a time *t* (in `HHMMhrs` format) returns the locations open at *t*. Both ends are inclusive:
- if the starting time is before the closing time: *t* is at or after the starting time **and** at or before the closing time;
- if the starting time is after the closing time (closes after midnight): *t* is at or after the starting time **or** at or before the closing time.

**Error responses** (standard HTTP meanings):

| Code | When |
|---|---|
| **400** | Invalid input: `time` not in `HHMMhrs`; `type` not one of the location types (an error, not an empty result); an unknown query parameter; a non-numeric ID; a required field missing (S1.2.1); an invalid field value (`name` over 100 characters, `type` not in the table, `floor` not a whole number, hours not in `HHMMhrs`, `image_url` not `http(s)`); the body sets `id`, `status` or `version` on create; coordinates outside the campus boundary (S1.2.3); `version` missing on update; an update that tries to change `id` (S3.1.1) or empties a required field (S3.2.2) |
| **401** | No token, or one that is malformed, expired, signed with an unknown or untrusted key, or missing `sub`/`role` |
| **403** | Valid token but not an ADMIN, on `POST`, `PATCH`, deactivate or restore, or when sending `includeInactive=true`. Logged (U5.1.1) |
| **404** | No location with that ID: lookup (S2.3.3), update (S3.2.3), deactivate, restore |
| **409** | `name` matches an ACTIVE location on create or update (S1.2.2); out-of-date `version` on update (S3.3.3); deactivating a location that is already INACTIVE (S4.1.3); restoring one that is already ACTIVE; restoring would clash with an ACTIVE location's name (S4.3.2) |
| **500** | The server itself fails (e.g. the database is down) |
| **503** | The User Service's JWKS can't be reached, so tokens can't be verified |

**Error body:** Problem Details (RFC 9457), sent as `application/problem+json`, with the standard fields (`type`, `title`, `status`, `detail`, `instance`). `detail` explains what went wrong, e.g. which field was invalid. No extension fields for now.

Postman needs a real token: log in through the User Service and put it in the collection's `adminToken` / `userToken` variables. The service must be usable through Postman without the UI running (D2 point 3). Keep a Postman collection in `supplier-service/postman/`. Use Postman variables (e.g. `{{token}}`, `{{baseUrl}}`) for tokens and URLs; never commit real tokens or passwords.

## Logging

_Origin: AI doc, from the root AGENTS.md cross-cutting rule ("log unauthorised access attempts in a consistent structured format") and the correlation design approved by Cole Lin in chat on 2026-10-11. The [Open] item at the end of "Correlation" was raised by the Codex review of PR #130 and is the gateway owner's to settle. The shared log-line schema across all six services is **[Open]** and belongs to the team_

Every log line this service writes about a request is **one JSON object on one line**, so the lines
can be collected and searched by the Centralized Logging service (issue #52).

**They go through the shipper**, `src/common/log-shipper.ts` — a copy of
`logging-service/src/client/log-shipper.ts`, which is the canonical one; this repository has no
shared package, so a change there has to be repeated here. `src/common/log.ts` holds this service's
instance, with `service: 'supplier'`.

The shipper writes the line itself rather than through Nest's logger, which would wrap the JSON in
its own timestamp, PID, level and context and leave a collector digging it out. It also adds the
three fields every line needs: `lineId` (a UUID, the store's primary key), `ts` (ISO-8601 UTC) and
`service`.

**No broker is configured**, so lines go to stdout only — nothing here depends on Kafka, and the
service still runs and is testable on its own (`SUPPLIER_DEV_AUTH`, Postman on `:3002`). When the
shared broker (#75) is wired up, a publisher is handed to the shipper in `log.ts` and nothing else
in this service changes.

| Event | Level | When |
|---|---|---|
| `request_completed` | info / warn / error | **Every request**, whatever the outcome. `info` under 400, `warn` for 4xx, `error` for 5xx |
| `access_denied` | warn | Every 401 and 403 (backlog U5.1.1) |
| `jwks_unavailable` | error | A 503: the User Service's JWKS can't be reached |
| `unhandled_error` | error | Every 500, whether or not it arrived as an `HttpException` |

**Every request, not only the failures** _(Origin: Team — Cole Lin, 2026-10-23)_. Until then this
service logged nothing on a success, so the store could say who was refused but not what anyone
actually did, and had no durations to compare. `request_completed` carries the method, the path, the
status, `durationMs` and the caller.

It is **middleware**, not a Nest interceptor — `src/common/request-log.ts`. Guards run *before*
interceptors, so an interceptor never sees a request `JwtAuthGuard` refused: it would miss every 401
and 403, and 404s for unrouted paths. A `finish` listener catches all of them, including a response
written by the exception filter. It also listens for `close`, so a request the client gave up on
still produces a line, marked `aborted`.

**A refused request therefore produces two lines from this service** — `request_completed` and
`access_denied` — sharing a `requestId`. They answer different questions: the first is the uniform
per-request record, the second is the one the backlog asks for by name (U5.1.1) and carries the
reason. The consequence worth writing down: **any "how many denials" query has to pick one event and
stay with it**, or two counts will disagree. Add the gateway's own lines for the same request and
there are four records in two places.

**What stays out of the shipped line.** The JWKS failure message names the JWKS URL, and a 500's
stack can carry whatever the failure touched (a connection string, say). Both still go to Nest's
logger, which is local to the container; neither reaches the store, which is queryable by anyone
with access to it.

**Correlation.** Each of those lines carries a `requestId`, which is how a line here is matched to
the gateway's `request_completed` line for the same request:

- The API Gateway mints an id per request and forwards it as `x-request-id`
  (`api-gateway/src/proxy.ts`). **If PR #69 lands**, the gateway becomes stock Envoy, which still
  generates and propagates the header and still sets it in the response, but drops the Node
  gateway's length and charset rule and can pass a caller's value straight through
  (`api-gateway/envoy/behaviour-differences.md`). This service's own check is then the only one.
- This service takes that header when it matches `[A-Za-z0-9._:-]{1,128}`, and otherwise **mints its
  own** id. A malformed or missing header is replaced, never rejected: the id is diagnostic metadata,
  so it must not turn a working request into a 400. Minting also means direct calls that skip the
  gateway (Postman on `:3002`) still produce joinable lines.
- The id is echoed back in the `x-request-id` response header, so a bug report can quote it.
- **`path` is the pathname only, never the query string.** `?lat=…&lon=…` is the caller's
  position, and a line that carries it also carries `userId` (root AGENTS.md: never log unmasked
  personal data). The gateway drops query strings for the same reason. See `logPath()`.
- See `src/common/request-id.ts`. Service-layer code (`locations.service.ts`) has no request object
  and so logs no id; if that is ever needed, it takes an `AsyncLocalStorage` store.

**[Open] Replacing a caller's id breaks the correlation it exists for.** Raised by the Codex review
of PR #130. When the gateway forwards a caller-supplied id this service rejects — `unsafe/id`, say —
this service mints a new one, but the gateway has already logged the original and returned the
original to the client. The gateway's line and this service's line then share nothing, for exactly
the requests where someone sent a deliberately odd id, which is when a trace is most wanted.

This service cannot fix it: the gateway mints the id, tells the client what it was, and logs it, so
any downstream replacement is a second id nobody else knows about. **The fix belongs to the gateway
(Jie Yang):** have Envoy always generate its own id for edge requests instead of preserving a
caller's. Envoy preserves only for requests it classifies as *internal*, and
`api-gateway/envoy/behaviour-differences.md` records its Docker tests retaining `trace-123` and
`unsafe/id` — so the first thing to check is whether outside requests are being treated as internal,
which is worth fixing regardless of logging: an edge caller should not get to choose its own trace
id. **Verify before changing anything:** send `x-request-id: unsafe/id` through the running gateway
and read the access log.

Rejected on purpose: logging the invalid id alongside the new one. That means writing a
caller-controlled string into a queryable store to paper over a case that should not arise, and adds
a field to the shared schema in #52 that the team has not agreed.

The mint stays either way — a direct call to `:3002` has no id at all, and D2 requires this service
to be testable alone.

**[Open]** Service-to-service calls (Order → Supplier in D3) must forward the incoming
`x-request-id`, or the chain breaks at the first hop. That is a team-wide convention, not this
service's to decide alone.

Never log tokens, the `Authorization` header, or unmasked personal data (root AGENTS.md).

## Query events from Order [Decided]

_Origin: Team_

- Order Service publishes **query events** to a message broker to query Supplier's database, e.g. asking for all locations of type Food. Supplier Service is the only consumer of these events.
- Each query carries a **timestamp**. Supplier rejects an old query when the same user has already sent a newer one.
- Order just shows loading while it waits for the response. If no response arrives, it times out and shows an error.
- **[Open]** How the response gets back to Order.

## Open

- Ordering by type or building (backlog S2.2.2) is pending; `order=asc|desc` on `name` is supported.
- Whether error responses add an `errors` extension listing each invalid field (pending; `detail` covers it for now).
- Whether `image_url` should only allow GitHub-hosted images is pending; for now any `http://` or `https://` URL is accepted.
- Created / last-modified timestamps and creator columns (S1.3.1, S1.3.2, S2.3.2) are pending.
- Later: in the `name` search, `%` and `_` typed by the user act as `LIKE` wildcards; escape them if they should match literally.
- Backlog S1.2.4 rejects hours whose closing time is before the opening time; the team allows it (closes after midnight). The format part of S1.2.4 matches the `HHMMhrs` rule.

## Edge cases

TBD
