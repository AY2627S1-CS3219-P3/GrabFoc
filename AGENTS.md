# AGENTS.md — FoC (CS3219 AY26/27 S1, Project Group 3)

Context for AI coding agents and new contributors. Read this before changing code or docs.

Status legend: **[Decided]** agreed by the team / in the submitted backlog · **[Proposed]** design draft for D2/D3, confirm with the service owner before relying on it · **[Open]** undecided.

---

## 1. Product

FoC is a peer-to-peer campus errand web app for NUS students.

- A **requester** creates an **order** to have items collected from a campus **location** (pickup point) and delivered to a drop-off point.
- A **courier** (another student) accepts the order, picks up the items, delivers them, and is paid in **credits**.
- Every user can act as both requester and courier.
- **Closed credit economy:** credits can't be bought, withdrawn or exchanged for money. Each new user gets **10 credits**. Credits are whole numbers.
- Credits are **reserved** when an order is created, **transferred** requester → courier on completion, and **released** back to the requester on cancellation.
- **Out of scope:** paying vendors for goods, supplier menus/catalogues/inventory/checkout, live courier GPS tracking.

## 2. Terminology rules (apply in code, docs, UI copy, commit messages)

- Say **order**, never "errand" or "request" (note: the Figma mockup still says "Errand" — known inconsistency).
- Say **requester** (not "requestor") and **courier**.
- A "supplier" in the project brief = a **location**: a named campus pickup point identified by a label + coordinate. It may be a vendor ("Starbucks@UTown") or just a place ("COM3 Basement").
- Roles are `ADMIN` and `USER`. "Requester" and "courier" are **modes of a USER**, not roles (see §5).
- Order states are ALL CAPS: `PENDING`, `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS`, `ARRIVED`, `COMPLETED`, `CANCELLED`.
- Location states: `ACTIVE`, `INACTIVE`.
- Backlog wording: "The system shall …" (not "should"/"will"/"The service"). Requirements must not name other services — describe the service's own boundary (APIs it exposes, events it publishes/consumes) instead.
- Backlog ID prefixes: `OSFR`/`O` (Order), `USFR`/`U` (User), `CSFR`/`C` (Credit), `SUFR`/`S` (Supplier), `NTFR`/`N` (Notification), `NFRn` (non-functional). Every entry refines at least two levels (e.g. SUFR1 → SUFR1.1 → S1.1.1).

## 3. Architecture

- Microservices, each with its **own database** (no cross-service DB access or foreign keys).
- Services: **API Gateway**, **User**, **Supplier**, **Order**, **Credit**, **Notification** (+ Frontend; Centralized Logging is an N2H).
- **API Gateway [Decided]:** the single entry point for the frontend. It authenticates requests (JWT middleware) and routes them to services. See §10.
- Communication **[Decided]**:
  - Synchronous HTTP between services (e.g. Order → Credit to reserve/transfer/release, Order → Supplier to check a location).
  - **The only async flow:** Order Service **publishes** order-state events to a message broker; **Notification Service is the only consumer**. Order never waits on Notification.
- **Database [Decided]:** PostgreSQL for User and Supplier. **[Proposed]** PostgreSQL for the other services too (a separate database per service). SQLite only for tests.
- **Stack [Decided]:** TypeScript/Node with **Zod** for request validation and an ORM / parameterized queries for database access.
- Containerised with Docker / Docker Compose (M7). Cloud deployment and CI/CD are N2Hs.

### Repository layout [Decided]

The repo follows the template's **one-service-per-folder** rule (see `README.md`): every service is its own **top-level** folder. There is no `/backend` wrapper.

```
.
├── user-service/          # core (template)
├── supplier-service/      # core (template)
├── order-service/         # core (template)
├── credit-service/        # core (template)
├── api-gateway/           # extra service, same level
├── notification-service/  # extra service, same level
├── frontend/
├── data/
│   ├── csv/supplier-seed-data.csv   # Supplier seed data (from the template)
│   └── images/                      # location images for the seed data
├── compose.yaml
├── .env.example
└── README.md
```

- Each service folder has its own `Dockerfile`, `README.md` and `AGENTS.md`. Put service-specific agent notes in that service's `AGENTS.md`.
- Any N2H that needs its own service (e.g. centralized logging, real-time chat) gets a new top-level folder, following the same structure.
- Agent configs, prompts and skills may be added, but core code must stay inside the service folders.

### Ownership

D2 split **[Decided]**:

| Area | Owner |
|---|---|
| API Gateway | Jie Yang |
| User Service | Deanson, Zi Yi |
| Supplier Service | Cole Lin, Jian Bing |
| Supplier management UI | **[Open]** unassigned |

Overall plan (from the Gantt chart):

| Area | Owner |
|---|---|
| Supplier Service, Notification Service, CI/CD, Cloud deployment | Cole Lin |
| Order CRUD/listing, frontend supplier-listing page, Centralized Logging | Jian Bing |
| Order acceptance/lifecycle/history, containerisation, Real-time chat | Jie Yang |
| Credit Service, service integration, Admin dashboard | Zi Yi |
| User Service, UI mockup | Deanson |

**[Open]** Deanson has no N2H assigned yet (every member needs one).

## 4. Milestones

| Milestone | When | Focus |
|---|---|---|
| D1 | Presented Sep 9–12; backlog due Sep 17 23:59 | Product backlog, UI mockups, project plan |
| D2 | Week 7 (w/c 28 Sep) | User + Supplier services, supplier management UI, containerised demo |
| D3 | Week 10 | Order + Credit, async workflow, containerisation, N2H plan |
| D4 | Slides + final commit **Nov 11 2026, 10:00**; presentations Nov 11–14 | Full demo |

### D2 expectations

**User Service**
- Role design and each role's capabilities (§5 — keep this updated; it is reused in the D4 presentation).
- Database choice and schema.
- Credential storage.
- Authentication and RBAC.
- Integration with Supplier.
- Profile protection.
- First-admin bootstrap, promotion workflow, and role edge cases.

**Supplier Service**
1. Database and schema.
2. Query patterns and API.
3. Backend CRUD, usable without the UI (Postman).
4. End-to-end integration with an authenticated user, showing role-based access.
5. Responsive management UI covering:
   - create, edit and delete
   - view records and details
   - search, filter and sort
   - paginate

**Marking bands:** points 1–4 = significant progress; points 1–5 = near-complete.

**UI rules**
- The UI must use **live data from the Supplier API** — no mock or hard-coded suppliers.
- It must not be admin-only: show the standard user's view too.
- It must adapt between desktop and mobile layouts.

---

## 5. Roles & permissions [Decided roles; capability list Proposed]

- **ADMIN.** Moderates the platform and manages reference data. Solves: someone must maintain the location catalogue and deal with users who abuse the platform.
- **USER.** An ordinary student. Solves: everyone takes part in the errand economy.
  - The UI switches between **requester mode** and **courier mode**. This is a UI filter, not a permission.
  - The backend never authorises based on the mode. It authorises on role and **ownership** (e.g. only an order's requester can cancel it; only its assigned courier can advance it).
  - Persisting the last-used mode as a preference is optional.

| Capability | Unauthenticated | USER | ADMIN | Service |
|---|---|---|---|---|
| Register, log in, verify OTP, refresh token | ✅ | — | — | User |
| View/edit own profile (email, phone, password via OTP) | ❌ | ✅ | ✅ | User |
| Deactivate own account | ❌ | ✅ | ✅ (not if last admin) | User |
| Promote/demote users, suspend/reinstate accounts | ❌ | ❌ | ✅ | User |
| Browse, search, filter, view locations | ❌ | ✅ | ✅ | Supplier |
| Create, edit, deactivate, restore locations | ❌ | ❌ (403) | ✅ | Supplier |
| View inactive locations in listings | ❌ | ❌ | ✅ | Supplier |
| Create/edit/cancel **own** orders (requester mode) | ❌ | ✅ | ✅ | Order |
| View PENDING orders, accept, advance **assigned** orders (courier mode) | ❌ | ✅ | ✅ | Order |
| View own credit balance | ❌ | ✅ | ✅ | Credit |
| View any user's balance, all orders, audit logs (admin dashboard N2H) | ❌ | ❌ | ✅ | Credit / Order / Logging |

## 6. Order Service

**Lifecycle [Decided]**

```
PENDING → ACCEPTED → PICKED_UP → IN_PROGRESS → ARRIVED → COMPLETED
```

- `PENDING → CANCELLED`: by the requester, or automatically when the timing window closes.
- `ACCEPTED / PICKED_UP / IN_PROGRESS → CANCELLED`: only when **both** parties confirm, or automatically on timeout.
- `ARRIVED → COMPLETED` and `ARRIVED → CANCELLED`: only when **both** parties confirm.
- `COMPLETED` and `CANCELLED` are final.

**Rules**

- Only `PENDING` orders can be accepted.
- A requester can't accept their own order.
- At most one courier per order; a courier may hold at most one active order.
- Requester may edit pickup, drop-off, description and timing window only while `PENDING`. The credit offer can't be edited.
- Timing window may change in later states only when both parties acknowledge.
- System-assigned fields (order ID, requester ID, timestamps) are never taken from the request body. The requester ID comes from the authenticated token.
- Creation requires the credit reservation to succeed **and** the pickup location to be `ACTIVE`.

**Events [Decided]**

- Event names: `OrderAccepted`, `OrderPickedUp`, `OrderInProgress`, `OrderArrived`, `OrderCompleted`, `OrderCancelled`.
- Payload: event type, order ID, requester ID, courier ID, timestamp.
- **[Open fix]** Also add a unique **event ID**. Notification deduplicates on it.
- Publish only after the state change is committed. The transactional outbox pattern is the robust option.

## 7. Credit Service

- One account per user, created at registration with 10 available credits.
- Available and reserved balances are kept separately. The available balance may never go negative.
- **Reserve** on order creation (only if the available balance is enough).
- **Transfer** requester-reserved → courier-available on `COMPLETED`.
- **Release** reserved → requester-available on `CANCELLED`.
- **Invariant:** total credits in the system never change during a reserve, transfer or release.
- Every operation is atomic and idempotent: applying the same operation twice must not change balances twice. For example, a completion processed twice must not pay the courier twice.
- Users can see only their own balance; admins can see any.

## 8. Supplier (Location) Service

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
- Seed data loads on first startup. It is all-or-nothing, and re-running it must not create duplicates (fixed IDs + `ON CONFLICT DO NOTHING`).
- **[Decided]** Seed data comes from the **professor's template repository**: `data/csv/supplier-seed-data.csv`, with images in `data/images/`. **[Open]** Reconcile the schema fields with that dataset's fields.

### Schema [Decided: locations + indexes; Open: location_changes placement]

```sql
CREATE TABLE location_types (
  code TEXT PRIMARY KEY, label TEXT NOT NULL, sort_order INT NOT NULL DEFAULT 0
);  -- FOOD, PRINT, CONVENIENCE, VENDING, GENERAL

CREATE TABLE locations (
  id              UUID PRIMARY KEY,                       -- UUIDv7, app-generated
  display_label   VARCHAR(100) NOT NULL CHECK (char_length(btrim(display_label)) BETWEEN 1 AND 100),
  location_type   TEXT NOT NULL REFERENCES location_types(code),
  building        TEXT NOT NULL,
  floor           TEXT NOT NULL,                          -- [Open] may become nullable for outdoor spots
  description     TEXT NOT NULL,
  latitude        NUMERIC(8,6) NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude       NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  operating_hours JSONB CHECK (operating_hours IS NULL OR jsonb_typeof(operating_hours) = 'object'),
                                                          -- {"mon":[["08:00","21:00"]], ...}; overnight = split ranges
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
- **[Open] Filtering by opening/closing time** doesn't work well with `operating_hours` as JSONB. If the UI filters by time, store hours in a `location_hours(location_id, day_of_week, opens, closes)` table, or in `opens_at` / `closes_at` columns.
- The catalogue is roughly 200 rows (about 10 pages), so it stays in the buffer pool. **No Redis cache**: a second cache risks serving stale data (NFR3.3).
- Pagination: OFFSET is acceptable at this size because the mockup has numbered pages. Keyset (`WHERE lower(display_label) > :last`) is the scalable option.

### API [Decided]

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

## 9. Notification Service

- Email only. Consumes order-state events and emails the right party. Stores almost nothing.

**Who gets emailed [Decided]**

| New state | Recipient |
|---|---|
| `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS` | requester |
| `ARRIVED` | requester |
| `COMPLETED` | requester and courier |
| `CANCELLED` | requester, plus the courier if one was assigned |
| any other state | recorded and discarded |

**Rules**

- Deduplicate on the event ID: send at most one email per event.
- Keep the last processed state per order and discard stale events. State order: `PENDING < ACCEPTED < PICKED_UP < IN_PROGRESS < ARRIVED < COMPLETED/CANCELLED`.
- Mark an event handled only after its send outcome is saved. After a restart, resume from the last handled event.
- Don't retain rendered email bodies. Mask email addresses in logs.
- **[Proposed]** Retry with exponential backoff. After 5 failures, move the event to a dead-letter queue that an admin can re-submit.
- **[Proposed]** Look up the recipient's email by account ID at send time, so no personal data travels through the broker.
- **[Proposed]** Target: 95% of emails handed to the mail provider within 10 s of the event.

## 10. User Service & authentication

### Database [Decided: PostgreSQL + these three tables]

| Table | Key columns |
|---|---|
| `users` | id, email_lookup (unique), encrypted email/mobile, password_hash, role (`ADMIN`/`USER`), status, email_verified, failed_attempts, locked_until, timestamps |
| `refresh_tokens` | id, user_id → users, token_hash (unique), family_id, expires_at, revoked_at |
| `otps` | id, user_id → users, purpose, code_hash, attempts, expires_at, used_at, invalidated_at; partial unique index on (user_id, purpose) for live OTPs |

- **Query pattern.** Almost everything is a **point lookup**: login by `email_lookup`, token refresh by `token_hash`, profile by `id`. B+-tree indexes on these lookup columns and on the `user_id` foreign keys serve them in about h + 1 I/Os.
- **Read/write mix.** Reads dominate (logins, profile views). Writes come from registration, OTP issue/verify and refresh-token rotation.
- **Scalability [Proposed].** A campus-sized user base fits comfortably in one PostgreSQL instance. Scale with indexes first, then read replicas. Sharding (e.g. by hash of user ID) isn't needed at this scale; name it as the next step only if asked.
- Clean up expired OTPs, expired refresh tokens and unverified accounts older than 24 h with a scheduled job.

### Credentials [Decided]

- Passwords: **bcrypt** (salted, slow hash). Minimum 8 characters, with at least one uppercase letter, one lowercase letter and one digit.
- Email and mobile: encrypted with AES-256-GCM.
  - A random IV means an encrypted email can't be looked up, so also store a **blind index**: `email_lookup = HMAC-SHA256(lower(email))` with a unique index.
  - Use it for registration uniqueness and login lookup.
- OTPs: stored as an **HMAC** with a server secret. Not plain SHA-256: 6-digit codes are brute-forceable if the table leaks.
- Emails must be on the NUS domain.

### Tokens [Decided: JWT access + refresh]

- Access token: a short-lived **JWT** (15 min, signed RS256/ES256) carrying only `sub`, `role`, `iat`, `exp`, `jti` — no personal data.
- Refresh token: random, 7 days, stored **hashed**. It is rotated on every use; reusing an old one revokes the whole token family.
- Browser storage: access token in memory; refresh token in an `HttpOnly`, `Secure`, `SameSite` cookie.

### Authentication vs authorization [Decided]

- **Authentication at the API Gateway.** Middleware verifies the JWT (signature, `exp`, `iss`, `aud`, pinned algorithm) using the User Service's public key (JWKS endpoint).
  - Missing or invalid token → **401**.
  - Public routes that skip it: register, login, OTP verify/resend, refresh.
- **Authorization in every service.** Each service decides which roles may call which endpoints. It uses role middleware (e.g. `requireRole('ADMIN')` → **403**) plus ownership checks in handlers.
- **[Open] How services receive identity from the gateway.**
  - **[Proposed]** Forward the original `Authorization` header and have each service verify it again with a shared auth module (defence in depth).
  - If the gateway instead passes identity headers (`X-User-Id`, `X-User-Role`), services trust them blindly. Then **no service may publish a port** in `docker-compose.yml`, and the same isolation must be rebuilt in the cloud deployment.

### Profile protection [Decided]

- Changing email, phone or password requires an **OTP** sent to the user's email.
- **Zod schemas** list exactly the fields each endpoint may change, using `.strict()` or an explicit pick. A body containing `role`, `status`, `id` or other protected fields is rejected, which prevents mass assignment.
- **Parameterized queries / the ORM** prevent SQL injection. Zod does not; it only validates shape.
- The user being edited is always taken from the token (`sub`), never from the body or a path parameter, for self-service endpoints.

### OTPs & lockout

- **[Proposed]** OTPs:
  - 6 digits. The mockup shows 4 — change the mockup; 4 digits is too easy to guess.
  - Valid for 10 min, with at most 5 wrong entries per OTP and at most 3 OTP requests per account per 15 min.
  - Requesting a new OTP invalidates the previous one.
  - Verify and mark as used in a single atomic `UPDATE`.
- **[Open]** Lockout threshold. Backlog U2.3.1 says 3 consecutive failures. The proposal is 5 failures → 15-minute lock (CIS benchmark; within the NIST SP 800-63B cap of 100).

### Role lifecycle [Proposed]

- **First admin.**
  - Created on startup from `BOOTSTRAP_ADMIN_EMAIL`, only when no admin exists.
  - The account has no password until the owner sets one via OTP (the password-reset flow).
  - No password is ever stored in config. Creation is logged.
- **Promotion (no developer involvement).**
  1. An admin opens a user in the admin UI and chooses "Promote to admin".
  2. The service asks the acting admin for OTP confirmation.
  3. It sets `role = ADMIN` and logs who promoted whom, and when.
  4. The promoted user gets the new role on their next token refresh (≤ 15 min).
- **Demotion** works the same way, in reverse.
- **An admin revoking their own privileges:** allowed only if another active admin exists. It takes effect at their next token refresh.
- **The last admin demoting or deactivating themselves:** rejected (409) with a clear message. The system can never be left without an admin.
- **Never** assign `role` from a registration or profile payload.

### Integration

- **[Open]** Registration → credit account creation: a synchronous call to Credit, or an outbox. Either way, define what happens when Credit is down.

---

## 11. Cross-cutting rules for all code

- **Identity comes from the verified token only.** Never take a user ID, requester ID, role or owner from the request body.
- **Validate every request body with a strict Zod schema.** Unknown fields are rejected, not ignored.
- **Race-prone rules belong in the database**, via unique or partial indexes and conditional `UPDATE … WHERE` statements. Never check-then-write in application code. This covers:
  - one courier per order
  - unique labels and emails
  - single-use OTPs and refresh tokens
  - idempotent credit operations
- Write the change and its audit/history record in **one transaction**.
- Log unauthorised access attempts (401/403) in a consistent structured format, for the centralized logging N2H.
- Never log passwords, tokens, OTPs, handover codes, credit balances or unmasked personal data.
- Secrets live in environment variables or a secrets manager. **Never commit them.**
- Persist database data in Docker volumes, so it survives a container replacement.
- Only the API Gateway publishes a port in `docker-compose.yml`.

## 12. Edge cases & demo checks

### D2 demo checks

- An ADMIN can create, edit, deactivate and restore a location.
- A USER can browse, search and filter locations, but gets **403** on `POST /locations` and `PATCH /locations/:id`, and can't open the admin screens.
- No token → **401**. The Order Service doesn't exist until D3, so demo this against a Supplier endpoint (e.g. `GET /locations`).
- A body containing `role` or `status` sent to a profile update → **400**. The role is unchanged.
- The same CRUD calls work from **Postman** with the UI stopped.
- The UI shows live data and adapts from desktop to mobile.
- Diagram of the full request path to present: browser → gateway (authenticate) → Supplier Service (authorize) → PostgreSQL.

### General

- Two couriers accept the same order at the same moment → exactly one succeeds.
- A completion is processed twice → the courier is paid once.
- A crash between debiting the requester and crediting the courier → no credits are lost.
- A location is deactivated after the requester selects it but before the order is submitted → order creation is rejected.
- Two admins edit the same location → the second gets 409.
- Two admins create the same label at the same time → exactly one succeeds.
- The admin's connection drops mid-create → no partial record; a retry is rejected as a duplicate.
- Order events arrive out of order → no emails sent out of sequence.
- The mail provider is down → events wait and are retried; order flows are unaffected.
- An admin's role is revoked while their token is still valid → access continues until the token expires (≤ 15 min); the most sensitive actions re-check the role.
- The last admin tries to demote or deactivate themselves → rejected.
- A role field is sent in the registration payload → rejected by Zod; the role stays `USER`.

## 13. Known open items

- How services receive identity from the gateway: re-verify the JWT, or trust headers.
- Who owns the Supplier management UI for D2.
- Whether `location_changes` stays in Supplier or moves to Centralized Logging.
- How to store operating hours if the UI filters by opening/closing time.
- Reconcile the Supplier schema with the professor's seed-data fields.
- Add the event ID to the order event payload.
- Add Supplier search, filter and pagination FRs to the backlog.
- Change S1.2.2 to "unique among ACTIVE locations".
- Allow overnight operating hours (S1.2.4).
- Decide whether `floor` is required.
- Change the OTP to 6 digits in the mockup.
- Agree the lockout threshold (3 vs 5).
- Assign Deanson an N2H.
- Add a service name to every NFR row in the backlog.
- Credit and Notification sprint weeks don't match the Gantt chart.
