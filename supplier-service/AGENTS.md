# AGENTS.md — Supplier (Location) Service

Service-specific context for `supplier-service/`. Read the root [`AGENTS.md`](../AGENTS.md) first: it has the product, terminology, roles, the auth model, cross-cutting rules and the plan-first rule.

Status legend: **[Decided]** · **[Proposed]** · **[Open]** (defined in the root `AGENTS.md`).

**Why PostgreSQL [Decided]**
- The data is **structured**: every location has the same fields.
- Query patterns are paginated listing plus filter and sort (by type, building, name, opening/closing time), with parameterized queries.
- The catalogue is small and **read-heavy**.
- Constraints and partial indexes enforce the business rules (see design notes).

**Rules**

- Admin-only create, update, deactivate and restore. Any authenticated user can list and look up.
- Deletion is **soft**: the location is set `INACTIVE` and the row kept, so old orders can still show their pickup point.
- Listing returns `ACTIVE` locations only by default. It is sorted by label A→Z and can be ordered by label, type or building.
- Label must be unique among `ACTIVE` locations, compared case-insensitively. It is at most 100 characters.
- Coordinates must fall inside the configured campus bounding box (an application config value).
- Updates use **optimistic concurrency**: the request sends the `version` it loaded, and a stale version returns 409.
- Every write is audited (see `location_changes` below) and emits a structured log entry.
- Operating hours are optional: one opening time and one closing time. A closing time earlier than the opening time means the location closes **after midnight** (e.g. 11:00–02:00). This must be accepted; backlog S1.2.4 needs rewording to match.
- Seed data loads on first startup. It is all-or-nothing, and re-running it must not create duplicates (see "Seed data" below).

## Seed data [Decided: source; Proposed: loading rules]

The seed comes from the **professor's template repository**: `data/csv/supplier-seed-data.csv` (21 rows), with images in `data/images/`. Because the load is all-or-nothing (S5.2.2), one row that fails validation blocks the whole seed, so the loader must handle the file exactly as it is.

| CSV column | Column | Loading rule |
|---|---|---|
| `Name` | `display_label` | |
| `Type` | `location_type` | Look up the `location_types` row whose `label` equals the CSV value (`Food`, `Food/Coffee`, `Printing`, `Shopping`) |
| `Building` | `building` | |
| `Floor` | `floor` | Present in every row |
| `Location Description` | `description` | |
| `Latitude`, `Longitude` | `latitude`, `longitude` | The CSV has up to 9 decimals; the columns round to 6 (about 0.1 m) |
| `StartingTime`, `ClosingTime` | `opens_at`, `closes_at` | Parse `HHMMhrs` → `HH:MM` (`0900hrs` → 09:00). One row is overnight (Supersnacks, `1100hrs`–`0200hrs`) |
| `ImageURL` | `image_url` | 15 of 21 rows are empty → `NULL`. The rest are `github.com/<owner>/<repo>/blob/<branch>/<path>` links, which are HTML pages, not images; rewrite them to `raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` |

- **Encoding:** the file is **Windows-1252**, not UTF-8 (it contains curly apostrophes). Decode it as `cp1252`, or a UTF-8 reader will crash or corrupt those characters.
- **IDs:** the CSV has no IDs. Generate a deterministic UUIDv5 from the trimmed, lower-cased `Name` with a fixed namespace, and insert with `ON CONFLICT (id) DO NOTHING`, so re-running the seed adds nothing. Renaming a row in the CSV therefore creates a new location.
- **Creator:** seeded rows have no admin, so set `created_by` / `updated_by` (and `changed_by` in `location_changes`) to a fixed system UUID defined in config.
- **Campus bounding box:** the seed spans latitude 1.2904–1.3006 and longitude 103.7526–103.7794. The configured box must include these, or S1.2.3 rejects rows and the seed fails.
- Write a `SEED` row to `location_changes` for each inserted location.

## Schema [Decided: locations + indexes; Open: location_changes placement]

```sql
CREATE TABLE location_types (
  code TEXT PRIMARY KEY, label TEXT NOT NULL, sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO location_types (code, label, sort_order) VALUES   -- labels match the seed CSV's Type values
  ('FOOD', 'Food', 1), ('FOOD_COFFEE', 'Food/Coffee', 2), ('PRINTING', 'Printing', 3), ('SHOPPING', 'Shopping', 4);
-- Add more types as new rows; the frontend's filter chips read this table.

CREATE TABLE locations (
  id              UUID PRIMARY KEY,                       -- UUIDv7 app-generated; UUIDv5 for seeded rows
  display_label   VARCHAR(100) NOT NULL CHECK (char_length(btrim(display_label)) BETWEEN 1 AND 100),
  location_type   TEXT NOT NULL REFERENCES location_types(code),
  building        TEXT NOT NULL,
  floor           TEXT NOT NULL,                          -- [Open] may become nullable for outdoor spots
  description     TEXT NOT NULL,
  latitude        NUMERIC(8,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude       NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  opens_at        TIME,                                   -- optional; both set or both NULL
  closes_at       TIME,                                   -- closes_at < opens_at = closes after midnight
  CHECK ((opens_at IS NULL AND closes_at IS NULL)
      OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)),
  image_url       TEXT CHECK (image_url IS NULL OR image_url ~* '^https?://'),
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  version         INT  NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by UUID NOT NULL,   -- user ID, no cross-service FK
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by UUID NOT NULL
);

-- [Open] May move to the Centralized Logging service instead of living here.
CREATE TABLE location_changes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id),
  action      TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE','DEACTIVATE','RESTORE','SEED')),
  changed_by  UUID NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_values  JSONB,
  new_values  JSONB NOT NULL
);  -- retain 90 days (purge job)

CREATE UNIQUE INDEX uq_active_label ON locations (lower(display_label)) WHERE status = 'ACTIVE';
CREATE INDEX ix_active_type_label ON locations (location_type, lower(display_label))
  INCLUDE (building, image_url) WHERE status = 'ACTIVE';
CREATE INDEX ix_changes_loc_time ON location_changes (location_id, changed_at);
CREATE INDEX ix_changes_time     ON location_changes (changed_at);
```

**Design notes**

- **Where to keep the change history.** If `location_changes` stays in this service, the change and its history commit in one transaction (NFR1.5.3). If it moves to Centralized Logging, that guarantee is lost. Logging is also an N2H, and a must-have FR (S3.3.2) shouldn't depend on it. Recommendation: keep the table here, and *also* emit log entries.
- The uniqueness rule is enforced by the partial unique index, **not** by a check in application code. A check-then-insert allows write skew when two admins create the same label at once.
- Don't index `status` or `location_type` on their own. Few distinct values means low selectivity.
- Text search (`ILIKE '%term%'`) runs as a table-scan filter. Add a `pg_trgm` index only if the catalogue grows.
- **Hours are two `TIME` columns, not JSONB**, because the seed has one opening and one closing time per location. This also makes "open at time t" a plain query: `(opens_at <= closes_at AND :t BETWEEN opens_at AND closes_at) OR (opens_at > closes_at AND (:t >= opens_at OR :t <= closes_at))`. The second branch handles overnight hours.
- The catalogue is tens to low hundreds of rows (the seed has 21; the brief asks teams to add more), so it stays in the buffer pool. **No Redis cache**: a second cache risks serving stale data (NFR3.3).
- Pagination: OFFSET is acceptable at this size because the mockup has numbered pages. Keyset (`WHERE lower(display_label) > :last`) is the scalable option.

## API [Decided]

| Method & path | Access |
|---|---|
| `GET /locations?type=&building=&q=&sort=&order=&page=&limit=` | any authenticated user |
| `GET /locations/:locationId` | any authenticated user (returns `INACTIVE` too) |
| `POST /locations` | ADMIN |
| `PATCH /locations/:locationId` (body includes `version`) | ADMIN |
| `POST /locations/:locationId/deactivate` | ADMIN |
| `POST /locations/:locationId/restore` | ADMIN |
| `GET /location-types` **[Proposed]** | any authenticated user (feeds the filter chips) |

**Responses:**

| Status | When |
|---|---|
| 401 | No token, or an invalid one |
| 403 | Authenticated, but the role isn't allowed |
| 404 | Unknown ID |
| 409 | Stale `version`, or a duplicate active label |
| 400 | Zod validation failure (with field errors) |

The service must be fully usable through Postman without the UI running (D2 point 3). Keep a Postman collection in the repo.

## Edge cases

- Two admins edit the same location → the second gets 409.
- Two admins create the same label at the same time → exactly one succeeds.
- The admin's connection drops mid-create → no partial record; a retry is rejected as a duplicate.
