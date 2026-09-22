# AGENTS.md — FoC (CS3219 AY26/27 S1, Project Group 3)

Context for AI coding agents and new contributors. Read this before changing code or docs.

Status legend: **[Decided]** agreed by the team / in the submitted backlog · **[Proposed]** design draft for D2/D3, confirm with the service owner before relying on it · **[Open]** undecided.

**Origin labels.** Each heading has an _Origin:_ line saying where its content came from, so nothing written by AI is passed off as the team's:
- **Team**: the team's own idea or decision (from the submitted backlog or the team's D2 notes). AI may have formatted it.
- **Restated**: facts restated from a source (the project brief, D2 brief, template repo or lectures). Nothing to rewrite.
- **AI doc**: process or workflow text written by AI. The AI policy allows this; review it.

## Rules for AI agents — warn before breaking these

_Origin: AI doc, from the Brief (Appendix 2) and the team's instruction_

The course AI policy (Appendix 2 of the project document) restricts AI tools from design work, and breaking it can cost marks (up to a zero on the project). The rules are **warnings, not hard stops**: flag the issue clearly, then do what the human decides.

- **Warn before** proposing, choosing or changing any of these, and **ask the human to confirm** before going ahead:
  - system architecture or service boundaries
  - design patterns
  - data schemas (tables, columns, indexes, migrations that change the design)
  - interfaces: API endpoints, parameters, response shapes, event names or payloads
  - performance or security trade-offs
- **Warn before** writing decision rationales (trade-off analyses, risk statements, "we chose X because…"), or doing backlog work beyond formatting and wording (eliciting requirements wholesale, prioritising, consolidating the backlog, sprint planning).
- The warning names the policy point at risk in one or two lines, e.g. "Heads-up: choosing this column type is a schema decision under the AI policy. Confirm you want me to proceed." If the human confirms, proceed and record it in the attribution (see below).
- **[Decided] items are the team's design.** If code or a task would contradict one, flag it; change the design or these files only when the human says so.
- **[Open] and [Proposed] items** are for the team to settle. You may lay out options if asked, with the warning above.
- **No warning needed for:** implementing code from these designs, boilerplate and config, debugging, tests, refactoring, comments and docs, explaining concepts, and formatting or checking documents against the brief. All of it still needs the attribution below.

## Where to find things

_Origin: AI doc_

This file holds **project-wide** context only. Service-specific rules, schemas, APIs and edge cases live in each service's own `AGENTS.md`. **Before changing a service, read its `AGENTS.md` as well as this one.**

| Working on | Read |
|---|---|
| User Service: database, credentials, tokens, OTPs, role lifecycle | `user-service/AGENTS.md` |
| Supplier (location) Service: schema, indexes, API, query events from Order | `supplier-service/AGENTS.md` |
| Order Service: lifecycle, rules, events | `order-service/AGENTS.md` |
| Credit Service: balances, reserve / transfer / release | `credit-service/AGENTS.md` |
| API Gateway, how services authenticate and authorize | §6 below |
| Notification Service | §7 below |
| Seed data | `data/csv/supplier-seed-data.csv`, `data/images/` |
| Anything spanning several services | this file: §5 roles, §6 auth, §8 cross-cutting rules |

- Keep this file lean. New service-specific detail goes in that service's `AGENTS.md`; only project-wide decisions belong here.
- When the `api-gateway/` or `notification-service/` folder is created, give it its own `AGENTS.md` and move its section there.

## How to work: plan first

_Origin: AI doc; Restated from the Lecture and Brief Appendix 2_

- **Plan before writing code** for any change that:
  - touches more than one service, or a contract between services (HTTP APIs, event payloads);
  - changes a database schema or migration;
  - changes authentication, authorization, credits or other security-sensitive logic;
  - adds a new service or top-level folder.
- A plan lists the files to change, the implementation steps, how it will be tested, and any **design input it needs from the team** (a schema, API or event detail these files don't specify). If the agent suggests something to fill that gap, it says so with the warning from the AI-agent rules. **Wait for the human to approve the plan** before writing code.
- Don't build silently on anything tagged **[Open]** or **[Proposed]**. Name the item in the plan and confirm it with the service owner (§3 Ownership) first.
- Assumptions about what the **brief** requires (e.g. how the admin role works, which the brief leaves unspecified on purpose) must be validated with the **mentor**, not just the team. The lecturer: "If you make assumptions, get validated."
- If the requirements are unclear, ask questions before planning instead of guessing.
- **Attribute AI help** (course AI policy, Appendix 2 of the project document; missing or misleading disclosure can be treated as an academic integrity violation). Every AI-assisted change needs all of:
  - **A header comment at the top of each AI-influenced file**, in this shape:
    ```
    AI Assistance Disclosure:
    Tool: <tool> (model: <model>), date: <YYYY-MM-DD>
    Scope: <what the AI generated or changed>
    Author review: <what the human validated, edited or added>
    ```
  - **Pasted AI code blocks marked** with a comment such as `// AI-generated (edited by <name>)`.
  - **An entry in `/ai/usage-log.md`** with the timestamp, tool and mode (generate / refactor / debug / explain), the **exact prompts** and key responses, and the usage scenario. The team keeps this one shared log.
  - A human reviews, tests and understands the change before it is merged; each member stays accountable for the whole codebase.
  - Before final submission: a project-level **AI Use Summary** as the last section of `README.md` (tools, prohibited phases avoided, what AI was used for, how outputs were verified, link to the log), and all `AGENTS.md` / `SKILLS.md` files committed.
- Small changes inside one service that follow the documented rules (a bug fix, a test, a copy change) can go ahead without a separate plan.

---

## 1. Product

_Origin: Restated from the Brief; Team (Backlog C1.1.1: 10 starting credits)_

FoC is a peer-to-peer campus errand web app for NUS students.

- A **requester** creates an **order** to have items collected from a campus **location** (pickup point) and delivered to a drop-off point.
- A **courier** (another student) accepts the order, picks up the items, delivers them, and is paid in **credits**.
- Every user can act as both requester and courier.
- **Closed credit economy:** credits can't be bought, withdrawn or exchanged for money. Each new user gets **10 credits**. Credits are whole numbers.
- Credits are **reserved** when an order is created, **transferred** requester → courier on completion, and **released** back to the requester on cancellation.
- **Out of scope:** paying vendors for goods, supplier menus/catalogues/inventory/checkout, live courier GPS tracking.

## 2. Terminology rules (apply in code, docs, UI copy, commit messages)

_Origin: AI doc, written from the Backlog's conventions and the lecturer's D1 feedback; Team (a supplier is a location, from SUFR1)_

- Say **order**, never "errand" or "request" (note: the Figma mockup still says "Errand" — known inconsistency).
- Say **requester** (not "requestor") and **courier**.
- A "supplier" in the project brief = a **location**: a named campus pickup point identified by a label + coordinate. It may be a vendor ("Starbucks@UTown") or just a place ("COM3 Basement").
- Roles are `ADMIN` and `USER`. "Requester" and "courier" are **modes of a USER**, not roles (see §5).
- Order states are ALL CAPS: `PENDING`, `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS`, `ARRIVED`, `COMPLETED`, `CANCELLED`.
- Location states: `ACTIVE`, `INACTIVE`.
- Backlog wording: "The system shall …" (not "should"/"will"/"The service"). Requirements must not name other services — describe the service's own boundary (APIs it exposes, events it publishes/consumes) instead. (Existing breach: OSFR6.1 says "The Order Service shall".)
- Backlog content rules (lecturer's D1 feedback, L3–L4):
  - **No user stories.** State what the system provides.
  - **No technology, library or implementation names** (e.g. JWT, Kafka, Redis, Docker, a specific npm package). Naming an algorithm (bcrypt, AES-256) is fine. Technology choices belong in design docs such as this file.
  - **No UI details** ("click", "button", "page").
  - **Testable wording.** Not "secure", "proper", "fast"; give a measurable condition.
  - **Every requirement has an ID, NFRs included.**
  - **Don't make users or the browser responsible for system logic** (e.g. "the browser shall generate the ID" is a red flag).
  - **Keep each requirement inside one service**; a check another service already owns is scope creep and coupling.
  - **Cover every CRUD operation a heading implies.**
  - **Use one term per concept** (see the terminology rules above).
- Backlog ID prefixes: `OSFR`/`O` (Order), `USFR`/`U` (User), `CSFR`/`C` (Credit), `SUFR`/`S` (Supplier), `NTFR`/`N` (Notification), `NFRn` (non-functional). Every entry refines at least two levels (e.g. SUFR1 → SUFR1.1 → S1.1.1).

## 3. Architecture

_Origin: Restated from the Brief (M2–M7) and Lecture; Team (API Gateway, authentication at the gateway, PostgreSQL for User and Supplier, Zod, events published by Order and consumed by Notification, query events from Order to Supplier)_

- Microservices, each with its **own database** (no cross-service DB access or foreign keys).
- Services: **API Gateway**, **User**, **Supplier**, **Order**, **Credit**, **Notification** (+ Frontend; Centralized Logging is an N2H).
- **API Gateway [Decided]:** the single entry point for the frontend. It authenticates requests (JWT middleware) and routes them to services. See §6.
- Communication **[Decided]**:
  - Synchronous HTTP between Order → Credit to reserve/transfer/release
  - Order Service **publishes** query events to a message broker to query Supplier's database (e.g. all locations of type Food); **Supplier Service is the only consumer**. Order just shows loading while it waits for the response; if no response arrives, it times out and shows an error. Each query carries a timestamp, so Supplier can reject old requests (when the same user has sent a newer query).
  - Order Service **publishes** order-state events to a message broker; **Notification Service is the only consumer**. Order never waits on Notification.
- **Database [Decided]:** PostgreSQL for User and Supplier. **[Proposed]** PostgreSQL for the rest of the other services (for simplicity)
- **Tests [Decided]:** run database tests against **PostgreSQL in Docker** (e.g. Testcontainers or a test service in `compose.yaml`)
- **Stack [Decided]:** TypeScript/Nodejs with **Zod** for request validation and an ORM / parameterized queries for database access.
- Containerised with Docker / Docker Compose (M7). Cloud deployment and CI/CD are N2Hs.

### Repository layout [Decided]

_Origin: Restated from the Template (README) and Lecture (L6)_

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

_Origin: Team (Gantt chart, D2 split)_

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

_Origin: Restated from the Brief_

| Milestone | When | Focus |
|---|---|---|
| D1 | Presented Sep 9–12; backlog due Sep 17 23:59 | Product backlog, UI mockups, project plan |
| D2 | Week 7 (w/c 28 Sep) | User + Supplier services, supplier management UI, containerised demo |
| D3 | Week 10 | Order + Credit, async workflow, containerisation, N2H plan |
| D4 | Slides + final commit **Nov 11 2026, 10:00**; presentations Nov 11–14 | Full demo |

### D2 expectations

_Origin: Restated from the D2 brief and Brief_

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

**UI rules** · _Origin: Restated from the D2 brief, Brief (M1) and Lecture; Team (styling library left open)_
- The UI must use **live data from the Supplier API** — no mock or hard-coded suppliers.
- It must not be admin-only: show the standard user's view too.
- It must adapt between desktop and mobile layouts.
- **[Open]** Choose a UI styling / component library for the frontend. The lecturer asked teams not to hand-write responsive layouts ("Please don't try to write code for all these things manually").

---

## 5. Roles & permissions [Decided roles; capability list Proposed]

_Origin: Team (ADMIN and USER roles; requester/courier as a UI mode; admins handle abusive users); Backlog (USFR5, USFR6)_

- **ADMIN.** Moderates the platform and manages reference data. Solves: Should be able to suspend abusive users
- **USER.** An ordinary student. Solves: Main participant of our system
  - The UI switches between **requester mode** and **courier mode**. This is a UI filter, not a permission.
  - The backend never authorises based on the mode. It authorises on user role and **their ownership** with respect to the action (e.g. only an order's requester can cancel it; only its assigned courier can advance it).

`⚠ AI` The capability table below was drafted by AI based on backlog and team discussion

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

_Origin: Team (JWT token-based authentication, authentication at the API Gateway, authorization in every service);_

- **Authentication at the API Gateway.** Middleware verifies the JWT using the User Service's public key (JWKS endpoint).

## 7. Notification Service

_Origin: Team (Backlog NTFR1–3, NFR3.4);_

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
- **[Proposed]** Retry with exponential backoff?
- **[Decided]** (Backlog NFR3.4) Target: 95% of emails handed to the mail provider within 10 s of the event.

**Edge cases**

- Order events arrive out of order → no emails sent out of sequence.

---

## 8. Cross-cutting rules for all code

_Origin: Team (strict Zod validation; Backlog U5.1.1, NFR1.2, NFR1.5.3, NFR5.1); Restated from the Template and Lecture;_

- **Identity comes from the verified token only.** Never take a user ID, requester ID, role or owner from the request body.
- **Validate every request body with a strict Zod schema.** Unknown fields are rejected, not ignored.
- Write the change and its audit/history record in **one transaction**.
- Log unauthorised access attempts (401/403) in a consistent structured format, for the centralized logging N2H.
- Never log passwords, tokens, OTPs, handover codes, credit balances or unmasked personal data. Always have some security feature with it.
- Secrets live in environment variables or a secrets manager. **Never commit them.**
- Every environment variable a service reads must be listed in `.env.example` with a safe placeholder (template rule), so teammates know what to set. Real values go in the git-ignored `.env`.
- Persist database data in Docker volumes, so it survives a container replacement.

## 9. D2 demo checks

_Origin: Restated from the D2 brief and Lecture; Team (the admin, 403, 401, Postman and diagram cases in the team's D2 notes);_

Service-specific edge cases are in each service's `AGENTS.md`.

- An ADMIN can create, edit, deactivate and restore a location.
- A USER can browse, search and filter locations, but gets **403** on `POST /locations`, `PATCH /locations/:id` and `GET /locations?status=INACTIVE`, and can't open the admin screens.
- An ADMIN can list deactivated locations (`status=INACTIVE` or `ALL`) and restore one from the UI.
- No token → **401**. The Order Service doesn't exist until D3, so demo this against a Supplier endpoint (e.g. `GET /locations`).
- The same CRUD calls work from **Postman** with the UI stopped.
- The UI shows live data and adapts from desktop to mobile.
- Diagram of the full request path to present: browser → gateway (authenticate) → Supplier Service (authorize) → PostgreSQL.
- Diagram rules the lecturer checks: one consistent notation (if a box means a process, every box means a process), a **legend**, the big picture rather than class diagrams, and FoC's actual services. **[To be discussed later]** Notation (see §10).

## 10. Known open items

_Origin: AI doc, compiled from the team's notes, checks against the brief, backlog and template, and decisions in chat. The backlog-change items are reminders; the team writes and prioritises the actual requirement text_

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
- **For discussion (Order, D3):** add an `OrderCreated` event so couriers learn about new orders without polling; the lecturer called this "a typical use case for an event based communication". This would also mean Notification is no longer the only consumer. See `order-service/AGENTS.md`.
- Add a backlog FR that pickup and drop-off points must be on campus (the Order rules require it).
- Frontend UI styling / component library (§4).
- Architecture diagram notation (§9) — to be discussed later.
- Order → Supplier query events: how the response gets back to Order (`supplier-service/AGENTS.md`).
