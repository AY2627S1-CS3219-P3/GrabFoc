# AGENTS.md — Supplier (Location) Service

Service-specific context for `supplier-service/`. Read the root [`AGENTS.md`](../AGENTS.md) first: it has the product, terminology, roles, the auth model, cross-cutting rules, the plan-first rule and the **AI-agent rules** (warn before breaking them).

Status legend: **[Decided]** · **[Proposed]** · **[Open]** (defined in the root `AGENTS.md`).

**Scope for now:** simple CRUD on locations. Change history is pending (see Rules).

**Implementation [Decided]** · _Origin: Team_
- NestJS (TypeScript, Node.js), PostgreSQL through `pg` with plain parameterized SQL, strict Zod validation.
- JSON field names are the same as the columns (`id`, `name`, `type`, `building`, `floor`, `location_desc`, `lat`, `lon`, `image_url`, `status`, `version`), except the hours: `open_time` / `close_time`, as `HHMMhrs` strings (stored as minutes in `open_min` / `close_min`).
- **Auth, temporary (DEV-ONLY):** the service reads the caller from `X-User-Id` and `X-User-Role` (`ADMIN` / `USER`) headers so it can be tested in Postman. Missing or invalid → 401. Replace once the team decides how identity reaches the Supplier Service.
- Run and test instructions: `README.md`. Postman collection: `postman/supplier.postman_collection.json`.

**Why PostgreSQL [Decided]** · _Origin: Team_
- The data is **structured**: every location has the same fields.
- Query patterns are paginated listing plus filter and sort (by type, building, name, opening/closing time), with parameterized queries.

**Rules** · _Origin: Team (Backlog SUFR1–5 and team decisions)_

- Admin-only create, update, deactivate and restore. Any authenticated user can list and look up.
- Deletion is **soft**: the location is set `INACTIVE` and the row kept, so old orders can still show their pickup point.
- Listing returns `ACTIVE` locations only by default. Results are always ordered by `name` A→Z. Letting the caller choose the order (backlog S2.2.2–S2.2.3) is **PENDING**.
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

**`GET /locations` response:** a wrapped object, `{ "items": [...], "page": 1, "pageSize": 20, "total": 21 }`, so the UI can show numbered pages.

**Query parameters for `GET /locations`:**

| Parameter | Matching |
|---|---|
| `name` | case-insensitive substring match on `name` (matches anywhere, not just the start) |
| `type` | exact match |
| `building` | exact match |
| `time` | open at that time, in `HHMMhrs` format (rule below) |
| `includeInactive=true` | also return `INACTIVE` locations (ADMIN only) |
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
| **401** | No token, or an invalid or expired one |
| **403** | Valid token but not an ADMIN, on `POST`, `PATCH`, deactivate or restore, or when sending `includeInactive=true`. Logged (U5.1.1) |
| **404** | No location with that ID: lookup (S2.3.3), update (S3.2.3), deactivate, restore |
| **409** | `name` matches an ACTIVE location on create or update (S1.2.2); out-of-date `version` on update (S3.3.3); deactivating a location that is already INACTIVE (S4.1.3); restoring one that is already ACTIVE; restoring would clash with an ACTIVE location's name (S4.3.2) |
| **500** | The server itself fails (e.g. the database is down) |

**Error body:** Problem Details (RFC 9457), sent as `application/problem+json`, with the standard fields (`type`, `title`, `status`, `detail`, `instance`). `detail` explains what went wrong, e.g. which field was invalid. No extension fields for now.

The service must be usable through Postman without the UI running (D2 point 3). Keep a Postman collection in `supplier-service/postman/`. Use Postman variables (e.g. `{{token}}`, `{{baseUrl}}`) for tokens and URLs; never commit real tokens or passwords.

## Query events from Order [Decided]

_Origin: Team_

- Order Service publishes **query events** to a message broker to query Supplier's database, e.g. asking for all locations of type Food. Supplier Service is the only consumer of these events.
- Each query carries a **timestamp**. Supplier rejects an old query when the same user has already sent a newer one.
- Order just shows loading while it waits for the response. If no response arrives, it times out and shows an error.
- **[Open]** How the response gets back to Order.

## Open

- Caller-chosen sorting (backlog S2.2.2–S2.2.3) is pending; results are ordered by `name` A→Z for now.
- Whether error responses add an `errors` extension listing each invalid field (pending; `detail` covers it for now).
- Whether `image_url` should only allow GitHub-hosted images is pending; for now any `http://` or `https://` URL is accepted.
- Created / last-modified timestamps and creator columns (S1.3.1, S1.3.2, S2.3.2) are pending.
- Later: in the `name` search, `%` and `_` typed by the user act as `LIKE` wildcards; escape them if they should match literally.
- Backlog S1.2.4 rejects hours whose closing time is before the opening time; the team allows it (closes after midnight). The format part of S1.2.4 matches the `HHMMhrs` rule.

## Edge cases

TBD
