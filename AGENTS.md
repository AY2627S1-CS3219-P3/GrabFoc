# AGENTS.md — FoC (CS3219 AY26/27 S1, Project Group 3)

Context for AI coding agents and new contributors. Read this before changing code or docs.

Status legend: **[Decided]** agreed by the team / in the submitted backlog · **[Proposed]** design draft for D2/D3, confirm with the service owner before relying on it · **[Open]** undecided.

## Where to find things

This file holds **project-wide** context only. Service-specific rules, schemas, APIs and edge cases live in each service's own `AGENTS.md`. **Before changing a service, read its `AGENTS.md` as well as this one.**

| Working on | Read |
|---|---|
| User Service: database, credentials, tokens, OTPs, role lifecycle | `user-service/AGENTS.md` |
| Supplier (location) Service: schema, indexes, API | `supplier-service/AGENTS.md` |
| Order Service: lifecycle, rules, events | `order-service/AGENTS.md` |
| Credit Service: balances, reserve / transfer / release | `credit-service/AGENTS.md` |
| API Gateway, how services authenticate and authorize | §6 below |
| Notification Service | §7 below |
| Seed data | `data/csv/supplier-seed-data.csv`, `data/images/` |
| Anything spanning several services | this file: §5 roles, §6 auth, §8 cross-cutting rules |

- Keep this file lean. New service-specific detail goes in that service's `AGENTS.md`; only project-wide decisions belong here.
- When the `api-gateway/` or `notification-service/` folder is created, give it its own `AGENTS.md` and move its section there.

## How to work: plan first

- **Plan before writing code** for any change that:
  - touches more than one service, or a contract between services (HTTP APIs, event payloads);
  - changes a database schema or migration;
  - changes authentication, authorization, credits or other security-sensitive logic;
  - adds a new service or top-level folder.
- A plan lists the files to change, the approach, any schema or API changes, how it will be tested, and open questions. **Wait for the human to approve it** before writing code.
- Don't build silently on anything tagged **[Open]** or **[Proposed]**. Name the item in the plan and confirm it with the service owner (§3 Ownership) first.
- If the requirements are unclear, ask questions before planning instead of guessing.
- Small changes inside one service that follow the documented rules (a bug fix, a test, a copy change) can go ahead without a separate plan.

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
- **API Gateway [Decided]:** the single entry point for the frontend. It authenticates requests (JWT middleware) and routes them to services. See §6.
- Communication **[Decided]**:
  - Synchronous HTTP between services (e.g. Order → Credit to reserve/transfer/release, Order → Supplier to check a location).
  - **The only async flow:** Order Service **publishes** order-state events to a message broker; **Notification Service is the only consumer**. Order never waits on Notification.
- **Database [Decided]:** PostgreSQL for User and Supplier. **[Proposed]** PostgreSQL for the other services too (a separate database per service).
- **Tests [Decided]:** run database tests against **PostgreSQL in Docker** (e.g. Testcontainers or a test service in `compose.yaml`), not SQLite. The schemas use PostgreSQL-only features (`INCLUDE` indexes, `TIMESTAMPTZ`, `TIME`, JSONB, regex `CHECK`s), so SQLite tests would not match production.
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
- **Role toggle between requester and courier mode.** The brief checks this explicitly ("role-toggle functionality between requester and courier"). Demo it as the UI mode switch in §5; backlog USFR6 still needs a priority and sprint.
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

## 6. Authentication & authorization (gateway + every service) [Decided]

- **Authentication at the API Gateway.** Middleware verifies the JWT (signature, `exp`, `iss`, `aud`, pinned algorithm) using the User Service's public key (JWKS endpoint).
  - **[Open] Signing method conflict.** This design assumes asymmetric signing (RS256/ES256 + JWKS), but the template's `.env.example` has `JWT_SECRET`, which implies a shared secret (HS256). The team must pick one before building auth; the choice changes `.env.example` and every verifier.
  - Missing or invalid token → **401**.
  - Public routes that skip it: register, login, OTP verify/resend, refresh.
- **Authorization in every service.** Each service decides which roles may call which endpoints. It uses role middleware (e.g. `requireRole('ADMIN')` → **403**) plus ownership checks in handlers.
- **[Open] How services receive identity from the gateway.**
  - **[Proposed]** Forward the original `Authorization` header and have each service verify it again with a shared auth module (defence in depth).
  - If the gateway instead passes identity headers (`X-User-Id`, `X-User-Role`), services trust them blindly. Then **no service may publish a port** in `compose.yaml`, and the same isolation must be rebuilt in the cloud deployment.

## 7. Notification Service

_Kept here until the `notification-service/` folder exists; then move this section to its `AGENTS.md`._

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

**Edge cases**

- Order events arrive out of order → no emails sent out of sequence.
- The mail provider is down → events wait and are retried; order flows are unaffected.

---

## 8. Cross-cutting rules for all code

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
- Every environment variable a service reads must be listed in `.env.example` with a safe placeholder (template rule), so teammates know what to set. Real values go in the git-ignored `.env`.
- Persist database data in Docker volumes, so it survives a container replacement.
- Only the API Gateway publishes a port in `compose.yaml`.

## 9. D2 demo checks

Service-specific edge cases are in each service's `AGENTS.md`.

- An ADMIN can create, edit, deactivate and restore a location.
- A USER can browse, search and filter locations, but gets **403** on `POST /locations` and `PATCH /locations/:id`, and can't open the admin screens.
- No token → **401**. The Order Service doesn't exist until D3, so demo this against a Supplier endpoint (e.g. `GET /locations`).
- A body containing `role` or `status` sent to a profile update → **400**. The role is unchanged.
- The same CRUD calls work from **Postman** with the UI stopped.
- The UI shows live data and adapts from desktop to mobile.
- Diagram of the full request path to present: browser → gateway (authenticate) → Supplier Service (authorize) → PostgreSQL.

## 10. Known open items

- How services receive identity from the gateway: re-verify the JWT, or trust headers.
- JWT signing method: RS256/ES256 + JWKS, or HS256 with the template's `JWT_SECRET` (§6).
- Who owns the Supplier management UI for D2.
- Whether `location_changes` stays in Supplier or moves to Centralized Logging.
- Add the event ID and the new order state to the order event payload (O6.1.1); Notification's N2.1.1 requires the state.
- Add Supplier search, filter and pagination FRs to the backlog.
- Change S1.2.2 to "unique among ACTIVE locations".
- Change S1.2.4 to allow overnight hours (closing time before opening time); the seed data has one such location.
- Decide whether `floor` is required.
- Change the OTP to 6 digits in the mockup.
- Agree the lockout threshold (3 vs 5).
- Assign Deanson an N2H.
- Give USFR6 (requester/courier toggle) a priority and sprint; D2 checks it.
- Add a service name to every NFR row in the backlog.
- Credit and Notification sprint weeks don't match the Gantt chart.
