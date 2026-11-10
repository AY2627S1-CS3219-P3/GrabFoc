<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Combined the five member logs (ai/usage-log/<member>.md) into this one file and removed the
  member files. Each member's section is a high-level summary per service of what they and the AI
  discussed and built, and their key decisions; the exact prompts were removed at Jie Yang's
  request. The full entry-by-entry logs, prompts included, are in git history at commit 32bbb85
  (`git show 32bbb85:ai/usage-log/<member>.md`).
Author review: Human reviewed. Confirmed by every member (recorded by Jie Yang, 2026-11-10).
-->

# AI Usage Log: FoC (CS3219 AY26/27 S1, Group 3)

Required by Appendix 2 of the project document: a log in the repository of how the team used AI,
with timestamps and usage scenarios. Every AI-assisted change also needs the disclosure header in
each affected file (see `AGENTS.md`).

This file summarises each member's AI use, grouped by service: what was discussed and built with
the AI, and the decisions the member made. The full entry-by-entry logs, with every exact prompt,
are kept in git history at commit `32bbb85`:

```
git show 32bbb85:ai/usage-log/<member>.md
```

**Review status:** every section is ✅ Human reviewed, confirmed by all five members (2026-11-10).

## How to add to this log

- Add to **your own section**, under the service the work was for (add the service if it is new).
- Give the date or date range, what was discussed and built, and any decision you made, including
  AI suggestions you accepted or rejected.
- Mark the section ✅ Human reviewed once you have reviewed the work.

## Members

| Member | Tools |
|---|---|
| [Cole Lin](#cole-lin) | Claude Code |
| [Deanson](#deanson) | Claude Code |
| [Jian Bing](#jian-bing) | Codex, Claude Code |
| [Jie Yang](#jie-yang) | Codex, Claude Code |
| [Zi Yi](#zi-yi) | Claude Code |

---

## Cole Lin

- **Period:** 2026-09-22 to 2026-11-10
- **Tool:** Claude Code (Claude Opus 5)
- **Modes:** generate, debug, review, explain
- **Review status:** ✅ Human reviewed (all sections)

### Supplier Service ✅ Human reviewed

_2026-09-22 to 2026-11-10 · PRs #7, #28, #30, #33, #145, #239_

**What was discussed and built**
- The first version of the service from the design already agreed in `supplier-service/AGENTS.md`:
  location CRUD, search, the CSV seed (21 locations), Problem Details errors, the role guard, Zod
  validation and a Postman collection.
- A-Z / Z-A sorting, the service's Dockerfile, coordinate search (`lat`/`lon`, `distance_m`,
  `order=distance`) and verification of User Service tokens through JWKS.
- Correlation ids (`x-request-id`) and a structured `request_completed` line for every request.
- A security sweep for bug classes first found on the Logging Service: the JWKS key filter
  (`key_ops`, algorithm confusion, refetch limits), control characters in filters and names, and
  validation of `image_url`.
- A looser building filter (case-insensitive partial match, like the name filter).

**Key decisions (Cole Lin)**
- NestJS with `pg` and plain parameterised SQL; no ORM (Prisma, Drizzle, Knex rejected).
- Hours stored as minutes, entered as `HHMMhrs`; opening and closing times both present or both absent.
- Build the image from the repo root so it includes the seed CSV.
- Hand-rolled `node:crypto` token checks, no new dependency; issuer and audience checked only when
  configured; dev identity headers only behind a flag and never alongside a real token.
- A coordinate adds distance and ordering only, no radius filter or "nearest N".
- A malformed request id is replaced, never rejected.
- Request lines are logged from middleware, not an interceptor, so refused requests are logged too;
  both `request_completed` and `access_denied` are kept (backlog U5.1.1).
- Loosen the building filter rather than build a dropdown (no new endpoint or gateway route).
- The same JWKS gap in the Credit Service was flagged to its owner, not changed.

### Logging Service (Centralized Logging N2H, issue #52) ✅ Human reviewed

_2026-10-21 to 2026-11-10 · PRs #129, #157, #200, #223, #233, #234_

**What was discussed and built**
- The log store: a `log_lines` table, an ADMIN-only `GET /logs`, 30-day purge, Kafka ingest with a
  dead-letter topic, and a shared log shipper that each service copies.
- Many review rounds hardening it: redacting field names as well as values, byte limits, characters
  PostgreSQL cannot store, timestamp precision, consumer and producer shutdown races, and a startup
  retry when the broker is not ready.
- A test that fails if any service's copy of the shipper drifts from the canonical one.
- Three finished pieces of work found uncommitted in sync-conflict copies, updated and committed.
- Deployment on AWS (its own database, image repository and secret) and a `GET /logs` route through
  the gateway, with startup checks that no two services' gateway routes overlap.
- `ai/check-disclosures.py`, which lists changed files whose disclosure header gained no entry.

**Key decisions (Cole Lin)**
- Line format: each service names itself in `service`, ISO-8601 UTC `ts`, Envoy-aligned field
  names, `x-request-id` for tracing and `eventId` for idempotency.
- Corrected the AI's first ingest design (Envoy cannot write to Kafka): services log through Kafka,
  the gateway to stdout, with that gap written down.
- 30-day retention; deduplicate lines on insert.
- Replace an unsafe field name with an ordinal (`[key 1]`), ending six rounds of bounding what a
  caller could put in the marker.
- Move the Logging Service's host ports (3007/5437) when they clashed with Notification's.
- The gateway authenticates `/logs` and the Logging Service authorises it; no wider route set.

### Logging in the other services ✅ Human reviewed

_2026-11-08 to 2026-11-09_

**What was discussed and built**
- The User, Credit, Order and Notification Services and the API Gateway all ship log lines to the
  store; Order and User forward `x-request-id` on their calls, so one order can be traced across services.
- No log publisher under a test runner, `.dockerignore` rules in every build context, and a Logging
  section in each service's `AGENTS.md`.

**Key decisions (Cole Lin)**
- Do the gateway change and all recommended fixes in one PR; keep fixing review findings until none are left.

### Repository documentation ✅ Human reviewed

_2026-11-10_

- Rewrote the root `README.md` (product, team, run steps, services, repository tree, architecture,
  deployment), taken from existing docs and config. Cole Lin had the AI Use Summary section and the
  disclosure header taken out of the README.

---

## Deanson

- **Period:** 2026-09-27 to 2026-11-10
- **Tool:** Claude Code (Claude Sonnet 5, then Claude Opus 5.5)
- **Modes:** explain, generate, refactor, debug, verify
- **Review status:** ✅ Human reviewed (all sections)

### User Service ✅ Human reviewed

_2026-09-27 to 2026-10-19_

**What was discussed and built**
- Admin endpoints: list users, and change a user's role safely (`AdminLockService` locks the caller
  and the active admins in one transaction).
- Self-profile: `GET /users/me` and `PATCH /users/me`.
- The six OTP-protected self-service endpoints (email, mobile, password, deactivation) and admin reactivation.
- A restructure into the agreed NestJS layout, run in Docker and covered by Postman, with an `API.md` reference.
- Password reset keeps the OTP until the new password is saved.
- `UserRegistered` published through a transactional outbox, so the Credit Service creates new
  users' wallets.

**Key decisions (Deanson)**
- List users filtered by role and status only, without pagination or an email filter.
- Caught a bug the AI's tests missed: the last-admin check could never run; had it fixed.
- No `GET /users/:userId`; `PATCH /users/me` needs a token but no OTP and changes the name only.
- Adopted the AI's "verify first, consume the OTP only on success", because his literal request
  would have let a leaked token guess passwords freely; a new password must differ from the old one.
- Reactivation relies on the role guard; the notification step waits for the Notification Service.
- Designed the outbox himself: polling relay, lean table, `{type, eventId, userId, occurredAt}`
  payload, exponential backoff, the service starts without Kafka; rejected failure columns and a backfill.

### Frontend: orders and profile ✅ Human reviewed

_2026-10-21 to 2026-11-10_

**What was discussed and built**
- An order lifecycle document and a frontend integration plan written from his screen requirements.
- The order screens: create order on Home, available orders for couriers, the Orders page with
  requester and courier tabs, and the order detail page; status badges in colour; Active /
  Completed / Cancelled sections.
- Profile page: order totals, editing the display name, OTP-protected changes to email, mobile,
  password and deactivation, and tidy-ups (grouped contact details, no empty Credits Earned card,
  no placeholder avatar).
- A start and end time for the order window in the create and edit order form.

**Key decisions (Deanson)**
- Every screen requirement, 10-second polling, and what to defer.
- Filter finished orders in the frontend instead of adding a backend filter.
- Confirmed one API change: a `status` filter on `GET /orders/assigned` for the profile totals.
- Chose the colour of each status badge.

### Real-time chat (N2H) ✅ Human reviewed

_2026-11-08_

**What was discussed and built**
- Backend: a short-lived chat ticket from the Order Service, a NestJS + Socket.IO chat service with
  history and missed messages, a gateway route, Compose and CI.
- Frontend: a chat panel on the order page.

**Key decisions (Deanson)**
- Build and test the backend in Postman before any frontend work; approved both plans.
- Chat opens only for the requester and courier of an accepted order still in progress.

---

## Jian Bing

- **Period:** 2026-09-28 to 2026-11-10
- **Tools:** Codex (GPT-6) at first, then Claude Code (Claude Opus 5.5)
- **Modes:** explain (often a learning mode, where he made the design calls), generate, debug
- **Review status:** ✅ Human reviewed (all sections)

### CI, code scanning and review tooling ✅ Human reviewed

_2026-09-28 to 2026-11-09_

**What was discussed and built**
- CodeQL scanning on every PR, and a CI workflow running each service's tests and build.
- The SoCLaaS PR review script: a certificate stopgap, longer timeouts and retries, streamed reviews
  so the server's two-minute limit no longer cuts them off, and safe limits on review length.
- The usage log split into one file per member.
- Repairs to main's CI after Dependabot major upgrades (NestJS, Zod).
- Outside GitHub Actions that can sign in to AWS pinned to exact versions, kept current by Dependabot.

**Key decisions (Jian Bing)**
- Stay on Zod 4 (Zod 3 has an unpatched security advisory); keep NestJS on 11 with a patched dependency.
- Bound the review's length rather than remove the cap (flagged in a security review).
- Pin actions and add Dependabot, instead of leaving them on movable tags.

### Supplier Service ✅ Human reviewed

_2026-09-29 to 2026-11-10_

**What was discussed and built**
- Fixes for review findings on token verification, the service's Compose file, and unit and
  database tests, each checked by breaking the code on purpose.
- An end-to-end browser check of the D2 flows, which corrected a demo instruction.
- Location photos served from S3 instead of the course template's GitHub.

**Key decisions (Jian Bing)**
- Each container gets only its own environment variables.
- Photos in a private bucket per environment, read only through that environment's CloudFront.

### User Service ✅ Human reviewed

_2026-10-01 to 2026-11-08_

- The User container now receives only its own variables.
- A migration for schema changes that had been edited into the first migration in place.
  **Decision:** a migration rather than a manual fix or resetting staging's database.

### Credit Service ✅ Human reviewed

_2026-10-11 to 2026-10-22_

**What was discussed and built**
- The credit design in learning mode (he decided, the AI explained and challenged), then reserve,
  transfer and release with tests for concurrent requests.
- A redesign: balance reads, wallets created from `UserRegistered`, Kafka retries and dead-letter
  handling, a transaction history table and route, and transfer and release as Kafka commands only.

**Key decisions (Jian Bing)**
- One credit hold per order; repeated requests are safe; the database enforces it.
- Reserve is synchronous; transfer and release are asynchronous; Credit only moves and reports credits.
- Wallets come only from `UserRegistered`, never created on the fly.
- Kafka, chosen with Jie Yang, with shared rules: commands go to the receiver's topic, topics are
  created centrally from one list, each consumer has its own dead-letter topic.
- Stuck transfers go to a dead-letter queue for a human to replay, not auto-fixed.
- An append-only transaction table as the audit record.
- Remove the HTTP transfer and release routes (team consensus, mentor validated).

### Cloud deployment (N2H) ✅ Human reviewed

_2026-10-14 to 2026-11-10 · issues #58, #141–#143, PRs #146, #156, #191_

**What was discussed and built**
- The AWS deployment design, then Terraform for the whole stack on one ECS server per environment
  behind CloudFront.
- Routing at the edge: the gateway accepts only CloudFront traffic and sends `/gateway/*` to the API,
  everything else to the website.
- Continuous delivery: every merge to `main` builds the images once, deploys to staging and runs
  checks; production deploys the tested version after approval. The Notification and chat services
  were added to the deployment.
- Fixes found in live runs: server size, Kafka health checks and CPU, and service start order.
- The production environment.

**Key decisions (Jian Bing)**
- ECS on EC2 with Terraform, one server and one public subnet per environment, databases and Kafka
  as containers on one disk with daily backups; rejected Fargate, RDS, MSK and NAT on cost.
- CloudFront provides HTTPS (there is no domain for a certificate); a `/gateway` path prefix.
- Single AWS account; staging deploys on merge, production on manual approval.
- Larger servers (t3.xlarge) for staging and production instead of deploying apps one at a time.
- A manual restart step on first deploy instead of an automatic one.

---

## Jie Yang

- **Period:** 2026-09-24 to 2026-11-10
- **Tools:** Codex (GPT-6) at first, then Claude Code (Claude Opus 5.5)
- **Modes:** explain, generate, refactor, debug
- **Review status:** ✅ Human reviewed (all sections)

### Frontend ✅ Human reviewed

_2026-09-24 to 2026-11-10_

**What was discussed and built**
- Sign-in, sign-up and verification screens from the Figma mockup.
- Connecting the User Service: sessions kept in secure cookies on the server, token refresh handled
  on the server, password recovery, profile and logout.
- Connecting the Supplier Service: browsing, searching and filtering locations, admin screens,
  error messages and location thumbnails.
- Showing the credit balance and history.
- A full visual redesign ("campus route slip"), a design skill for future screens, and the admin
  dashboard and chat restyled to match.
- A "Propose new time" option on the order page.

**Key decisions (Jie Yang)**
- Use npm; keep tokens out of the browser; never reuse a refresh result.
- Frontend work does not change the User or Supplier Services; thumbnails use the image link the
  Supplier Service already returns.

### API Gateway ✅ Human reviewed

_2026-09-27 to 2026-10-22_

**What was discussed and built**
- A first gateway in Node (routing, token checks, clear error codes), then a move to Envoy with one
  route file per service, settings from the environment, a Postman collection and CI.
- Routes for Credit and other services as they were added.

**Key decisions (Jie Yang)**
- The gateway checks the token and forwards it; each service decides what the user may do.
- The gateway reads only its own settings file.
- Use stock Envoy and record every behaviour that differs from the old gateway; remove the old one.
- A key-server outage returns 503, not 401.

### Order Service: database ✅ Human reviewed

_2026-10-11 to 2026-10-13_

**What was discussed and built**
- The order schema, reviewed with the AI one topic at a time, then the database migrations and tests.

**Key decisions (Jie Yang)**
- One description per order; pickup and drop-off as location references with a snapshot of their details.
- Plain SQL migrations; new orders start as `PENDING`; a 24-hour default window.
- Only one courier can accept an order; a courier has one active order at a time; edits are checked
  against the version the user saw.
- Proposals need both parties, only one proposal at a time, and they expire or close with the order.

### Supplier Service ✅ Human reviewed

_2026-10-19_

- A `SupplierDeactivated` event sent through an outbox, so the Order Service can cancel affected
  orders. **Decision:** approved the outbox design; the owners confirmed the event.

### Containers and shared setup ✅ Human reviewed

_2026-09-29 to 2026-10-23_

- The gateway and frontend in the root Compose stack; automatic restarts for every long-running
  container; services no longer crash when their database restarts; Unix line endings for the
  Kafka setup scripts.

### Notification Service ✅ Human reviewed

_2026-10-26 to 2026-11-10_

**What was discussed and built**
- The service from scratch: planning issues, database, reading order events, sending emails with
  retries, CI, and emails for account suspension and reactivation.
- An internal User Service endpoint that returns a user's email to other services.
- Emails for proposals (time change, cancellation, completion), with a new `OrderChangeRequest`
  event from the Order Service.

**Key decisions (Jie Yang)**
- How each table works, the email templates, and who is emailed for each event.
- Retries reuse the Credit Service's delays; an email is dropped if the order has moved on.
- Old account events are recorded but not emailed.
- One proposal event with an outcome field (created, approved, rejected, expired); an unsent request
  email is cancelled once its proposal is resolved.

### Cloud deployment ✅ Human reviewed

_2026-11-09 to 2026-11-10_

- Found why the deployed chat failed (no chat service on AWS) and planned its deployment.
- Explained how to move location images to S3; the bucket design was left to the team and Jian Bing.

### Usage logs ✅ Human reviewed

_2026-11-10_

- Summarised every member's log by service, marked the reviews as done, rewrote each log into
  this high-level form without prompts, and combined them into this one file.

---

## Zi Yi

- **Period:** 2026-09-24 to 2026-11-10
- **Tool:** Claude Code (Claude Opus 5, then Claude Opus 5.5)
- **Modes:** explain, generate, debug, verify
- **Review status:** ✅ Human reviewed (all sections)

### User Service ✅ Human reviewed

_2026-09-24 to 2026-10-21 · PRs #9–#18_

**What was discussed and built**
- The foundation: configuration, database and migrations, encryption, JWT signing and the JWKS endpoint.
- Registration with OTP, login with lockout, refresh and logout, password reset, and the
  first-admin bootstrap.
- A check with the Order Service before an account is deactivated, and admin suspension of users
  with a `UserSuspended` event.

**Key decisions (Zi Yi)**
- RS256 with JWKS instead of HS256; `pg` with plain SQL; numbered migrations; stacked PRs.
- Refresh tokens last 90 days; five failed logins lock an account.
- Accepted the AI's suggestions: a decoy OTP so unknown emails can't be detected, lifting a lockout
  after a reset, and a startup warning when no admin exists.
- The event uses the flat shape the Credit Service already reads; deactivation fails closed when
  the Order Service is down.
- Adopted Deanson's outbox when merging, dropping his branch's own table.
- A suspended user's access token stays valid for up to 15 minutes; left to the team.

### Order Service ✅ Human reviewed

_2026-10-14 to 2026-11-05_

**What was discussed and built**
- The service in phases on Jie Yang's database: access, creating, editing and accepting orders,
  the lifecycle steps, cancellation, proposals needing both parties, credit settlement over Kafka,
  an expiry worker, `order.events` for notifications, tests and a Postman collection.
- Cancelling orders automatically when a user is suspended or a location is deactivated.
- Read-only admin routes for the dashboard (overview, order list, order history).

**Key decisions (Zi Yi)**
- New orders wait in an `AWAITING_CREDIT` state while credits are reserved, with a clean-up job;
  this replaced his first insert-reserve-commit design.
- Reserve credits over HTTP; transfer and release as Kafka commands.
- Expired orders refuse lifecycle steps but can still be cancelled.
- Either party may propose a new time (a change to an earlier team rule; the team was told).
- Order history doubles as the event outbox.
- A deactivated pickup point cancels orders not yet picked up; a deactivated drop-off point cancels
  every unfinished order.

### API Gateway ✅ Human reviewed

_2026-11-06_

- Gateway routes for the admin dashboard. **Decision:** keep `/admin/credits/**` unrouted.

### Frontend ✅ Human reviewed

_2026-10-16 to 2026-11-10_

**What was discussed and built**
- Feedback on the forgot-password screen.
- The admin dashboard: overview, orders, logins, users, suspend and reactivate, and banners on
  finished orders.
- Making users admins and removing admin rights, with an Admins tab.

**Key decisions (Zi Yi)**
- Record who was suspended on the cancelled order, instead of guessing.
- Allow the frontend to call the change-role endpoint after the AI flagged the security trade-off.
