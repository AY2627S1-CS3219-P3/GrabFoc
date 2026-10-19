<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Moved Zi Yi's section out of ai/usage-log.md into this file (issue #65); entry text unchanged.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-20
Scope: Added the User Service Postman suspension entry.
Author review: Reviewed by Zi Yi, 2026-10-20.
-->

# AI Usage Log — Zi Yi

Zi Yi's entries for the FoC AI usage log. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). Add entries to this file only, newest first.

### 2026-10-20 — User Service: Postman collection for suspension (#72) and the Order dependency (#71)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate, debug
**Files:** `user-service/postman/user-service.postman_collection.json`

**Scenario:** testing the #71/#72 branch. The AI explained that the existing collection now
breaks without an Order Service (deactivation asks Order first, so it answers 503) and
suggested adding the suspension cases instead of testing them by hand.

**Prompts:**
> list testing steps

> give me next steps, i just ran docker compose up --build

> why order svc not running?

> should we update postman collection instead?

> commit first, then make those changes

**What it produced:** seven requests at the end of the Admin folder (403 suspend as a USER,
409 suspend yourself, suspend, 403 `ACCOUNT_SUSPENDED` login, 401 refresh after suspension,
409 `USER_NOT_ACTIVE` again, 404 unknown id), `400 malformed userId on suspend` in Validation,
an `adminUserId` variable, and a note in the collection description that deactivation needs an
Order Service answering "no active orders". The `HAS_ACTIVE_ORDERS` and Order-down cases stay
manual. While testing, it also found my old `user-db` volume had no `user_events` table
(`001_init.sql` changed after it was applied), and started a stand-in Order container for the run.

**Verification:** newman against the compose stack on a fresh `user-db`, with the stand-in
Order answering "no active orders": 144 requests, 366 assertions, 0 failures. The
`UserSuspended` message was read back from `user.events`, keyed by the user id, and its outbox
row was marked published.

**What I changed or rejected:** Tested the collection myself in Postman on 2026-10-20.

### 2026-10-19 — User Service: active-order deactivation guard (#71) and `UserSuspended` (#72)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, debug
**Files:** new `user-service/src/infra/kafka/kafka.producer.ts`,
`src/users/{order.client,user-events.publisher,order-support.spec}.ts`; changed
`db/migrations/001_init.sql`, `src/config/env.validation.ts`, `src/common/errors/error-codes.ts`,
`src/users/{users.service,users.repository,users-admin.controller,users.module}.ts`, `API.md`,
`compose.yaml`, `package.json`, `package-lock.json`; root `.env.example`;
`api-gateway/src/routing/user.routes.ts`, `api-gateway/test/gateway.test.js`

**Scenario:** the User Service side of the Order Service work on `feat/order-service`, on a new
branch from `main`. The AI found Order's `GET /internal/orders/users/:userId/active` (my
2026-10-18 decision), that nothing in the User Service could set `SUSPENDED`, and that Credit and
Order's plan disagree on the `user.events` shape. It flagged the suspend endpoint, the event shape,
the outbox table and the Order-down behaviour as interface/schema/trade-off decisions under the AI
policy and asked me to choose before writing code.

**Prompts:**
> branch from main, we are trying to support order service (branch feat/order-service). So we
> shall resolve two issues https://github.com/AY2627S1-CS3219-P3/GrabFoc/issues/71 and
> https://github.com/AY2627S1-CS3219-P3/GrabFoc/issues/72

Answers to the AI's questions: event shape "whats the difference and which is better?";
suspension scope "Suspend only"; Order down "Fail closed, 503 (Recommended)"; delivery "outbox
table but use migration 001 is okay". Then:
> continue

**My decisions** (chosen from the options the AI laid out):
- `user.events` shape: flat `{ type, eventId, occurredAt, userId }`, keyed by `userId`. The AI
  explained the flat shape is what Credit's reader already accepts; the envelope from the Order
  plan (`eventType`, `data.userId`) would need Credit changed. I said continue with its
  recommendation. Order's (unbuilt) consumer must read this shape.
- `POST /admin/users/:userId/suspend` only; no endpoint to lift a suspension.
- Deactivation fails closed: 503 `SERVICE_UNAVAILABLE` when Order cannot answer.
- Outbox table `user_events` added to `001_init.sql`, not a new migration.

**What it produced:**
- `OrderClient.hasActiveOrders` (3 s timeout, `X-Service-Key`); the check runs in
  `requestOtp(DEACTIVATION)` and in `deactivateSelf` before the code is spent; 409
  `HAS_ACTIVE_ORDERS`;
- `UsersService.suspend`: under the last-admin lock, caller re-checked as an active admin, not
  yourself, target must be `ACTIVE`; status, session revoke and the outbox row in one transaction;
- `UserEventsPublisher`: every second, oldest first, marks `published_at` once Kafka stores it,
  stops at the first failure; `KafkaProducer` copied from Order's;
- env `USER_KAFKA_BROKERS`, `USER_ORDER_URL`, `USER_ORDER_SERVICE_KEY` (compose passes
  `ORDER_SERVICE_KEY`); gateway route; `API.md` events section; 14 unit tests.

**Flagged:**
- The partial index `idx_user_events_unpublished` is a schema detail beyond the table I approved.
- Existing `user-db` volumes must be recreated (`001_init.sql` changed; the runner tracks file names).
- Every root `.env` needs `ORDER_SERVICE_KEY` (≥ 32 characters) or the User Service won't start;
  until `order-service` runs in compose, deactivation answers 503.
- Known race: an order created between the active-order check and the deactivation commit is not
  caught. A suspended or deactivated user's access token stays valid for up to 15 minutes.
- `ORDER_SERVICE_KEY` is also added to `.env.example` on `feat/order-service`; keep one on merge.
- Owners to confirm: the gateway route (Jie Yang), the endpoint and event (Deanson), the shape
  (Order owners).

**Verification:** `npm test` 14 passed, `npm run lint` and `nest build` clean; gateway `npm test`
22 passed. End to end on a scratch database with a fake Order endpoint and the local Kafka:
deactivation 409 with active orders, 503 with Order down, 204 with none; suspend 403 for a USER,
200 for an admin, 409 again and for yourself; suspended login 403 `ACCOUNT_SUSPENDED`; the
`UserSuspended` message read back from `user.events` with key = `userId`; Credit ignored it.

**What I changed or rejected:** Reviewed every file on 2026-10-20.

### 2026-09-24 to 2026-09-25 — User Service Phase 0 foundation (PRs #9, #10, #12, #13)

**Tool:** Claude Code (Claude Opus 5) · **Mode:** generate, debug, explain
**Files:** `user-service/**` (source, tests, Dockerfile, README, AGENTS.md),
`compose.yaml`, `.env.example`, `.gitignore`

**Scenario.** Our User Service design already existed in our own working plan
(`user-service-work-plan.md`, written by Deanson and me from the D1 backlog). I used Claude
Code to (a) transcribe that design into `user-service/AGENTS.md` so it lived in the repo, and
(b) implement Phase 0 steps 1–4 from it: the NestJS skeleton, database and migrations, error
handling, crypto helpers, RS256 tokens with RBAC, and Redis-backed OTPs with email delivery.

<!-- TODO Zi Yi: check these against your own record and add any I have missed. -->

**Prompts (exact):**

> the code repo is in GrabFoc, my plan is to work on user service. the work plan is in
> user-service-work-plan.md, and workload split is user-service-workload-split.md. do not make
> any edits/implementations yet, lets just discuss on the implementation. note that for all the
> tracked files, try to ensure we keep to the AI guidelines in CS3219-ProjectDocument-FoC.pdf.
> right now maybe we can focus on setting up the phase 0 foundation. should we do this in a
> single commit or what? also i am new to this, so it would be good if you further explain on
> the foundation steps, such as what we need it for

> what is mailpit and mailservice for? for ORM, can you pull branch
> lihloway:feature/supplier-service to check the orm at supplier service? for "RS256 + JWKS" i
> think we can be the ones deciding which algorithm to use.

> okay, what will the user-service/AGENTS.md include?

> now lets do step 1, the nestjs skeleton

> how can i test use docker? or how can i make you help me test docker

> lets move on to step 2

> now we shall do step 3

> now lets work on step 4 on a new branch

> for pr 9,10,12,13 which need fixes?

> explain more on src/crypto boundary call on #12

> for now, we shall not have planned rotation

**What it produced.** The implementation code and tests for steps 1–4, the Dockerfile and
`compose.yaml`, the README, and a transcription of our design into `user-service/AGENTS.md`.
It also explained concepts I had not used before (Mailpit, database migrations, stacked
branches, JWKS, the `jose` library) and debugged failures with me.

**Decisions I made, which it did not:**

- **RS256 + JWKS over HS256.** I decided the algorithm; Claude flagged that it was a security
  trade-off under the AI policy and stopped for my decision.
- **`pg` with plain SQL, no ORM** — to match the Supplier Service, which the team had already
  settled.
- **Numbered migrations rather than startup `CREATE TABLE IF NOT EXISTS`**, after asking
  whether a database is always recreated from empty.
- **The `src/crypto` boundary wording** (Option B: name the two real locations rather than
  move code to satisfy a sentence).
- **No planned key rotation.** I asked what happens if our key leaks accidentally, which
  corrected an assumption in the suggestion I had been given.
- **Stacked pull requests** rather than one large branch.
- The **error body format across services is still open** — recorded as `[Open]` in
  `AGENTS.md` rather than decided unilaterally, because it is a cross-service interface and
  belongs to the team.

**What I changed or rejected:**

<!-- TODO Zi Yi: add anything you edited by hand before committing. -->

**Verification.**

- Read every generated file before committing; the `Author review:` line in each file header
  records what I checked.
- `npm test` (81 unit tests) and `npm run test:int` (18 integration tests against a real Redis).
- `docker compose up --build` — the stack builds and runs; migrations apply; `/health` and
  `/.well-known/jwks.json` respond; an OTP was delivered to the Mailpit inbox and verified;
  data survives a `down`/`up` cycle.
- The schema SQL was applied to PostgreSQL 17 and the columns checked against `AGENTS.md`.
- A token was verified against the live JWKS the way the gateway will, and a token signed with
  a different key was rejected.

**Review findings acted on.** Codex flagged six issues across the four pull requests. Five
were fixed (`logger.fatal` bypassing redaction; SMTP error messages interpolated into a log
line; the inaccurate `src/crypto` boundary claim; the key-rotation limit; the local startup
instructions). The sixth was this log.

### 2026-09-26 to 2026-09-27 — User Service Phase 1 steps 5–9: credentials and sessions (PRs #15, #16, #17, #18)

**Tool:** Claude Code (Claude Opus 5) · **Mode:** generate, debug, explain, verify
**Files:** `user-service/src/auth/**`, `user-service/src/users/**`, `user-service/src/otp/**`,
`user-service/src/config.ts`, `user-service/README.md`, `user-service/AGENTS.md`,
`user-service/postman/`, `.env.example`

**Scenario.** All five steps of Person A's Phase 1 track, from the rules already recorded in
`user-service/AGENTS.md`: sign-up (register / verify / resend), login with lockout, refresh and
logout, forgot/reset password, and the first-admin bootstrap. The rules were ours; the code, the
tests and the doc expansions were generated against them. One branch and one PR per step, each
stacked on the previous one.

**Prompts (exact):**

> implement register, verify and resend otp

> in users.repostiory.ts, is emailhash not required?

> explain the issue simply for POST /auth/register/verify

> keep 400 OTP_EXPIRED

> teach me the steps to do testing on my own

> on a new branch, i want to implement login,lockout,refresh,and logout. but lets implement login
> and lockout first

> implement refresh and logout

> for refresh, what does it mean from a user perspective? like the user will be logged out after a
> period of time?

> let user be logged out after 3months instead of 7days

> on a new branch, i want to implement forget and reset password

> currently, how does the account get locked out and what happens to the user? and how is the
> lockout lifted? also explain simply more on what the decoy record is for

> implement admin bootstrap

**Decisions I made, not the AI:**

- **`OTP_EXPIRED`, not 404, for `/auth/register/verify`** when no sign-up is waiting. The AI
  found the conflict between two lines of our own `AGENTS.md` and explained both sides; I chose
  the 400 and had the rule written down.
- **Refresh tokens last 90 days, not 7.** I asked what the 7 days meant for a user, then decided
  we would rather people stayed logged in for three months.
- **Five failures, not three, before a lockout** — already ours from D1, kept here.
- **The whole admin-bootstrap rule**, which was in `AGENTS.md` before step 9 started: keyed on an
  environment variable rather than an `ADMIN_PASSWORD`; runs only while the table is empty, so
  changing the variable later cannot add an admin; the row carries a NULL password; the account is
  claimed through forgot-password. Deciding it must be claimable that way is also what fixes how
  the address has to be stored.
- **I ran the testing myself** rather than taking the AI's verification runs as the record. It
  found a bug in its own instructions that way: two steps told me to put the variable in front of
  `docker compose up`, which silently does nothing because `compose.yaml` does not forward it.

**AI-proposed, and I adopted them after reading the reasoning.** All four are marked in
`AGENTS.md` and in its disclosure header:

- A **decoy OTP record** for an address with no account, so `POST /auth/password/reset` cannot be
  used to find out who has an account.
- **Lifting a login lockout** after a successful reset.
- The **`'Administrator'` display name** for the bootstrap row. `display_name` is NOT NULL and our
  plan never named one.
- A **startup warning** when `users` has rows but no ACTIVE admin. Our plan describes that state
  as needing a manual database change but asks for no warning. I took it because the state is
  otherwise invisible until someone hits a 403.

One more I want recorded as a judgement call rather than a bare acceptance: validating
`USER_BOOTSTRAP_ADMIN_EMAIL` at startup and **refusing to boot** on a bad value. Our plan does not
say what to do with a malformed address. The argument for failing loudly is that forgot-password
only accepts NUS addresses, so any other domain would silently create an admin account nobody
could ever claim. I agreed, but it changes startup behaviour, so it is called out in `AGENTS.md`
and in the README's troubleshooting list.

**What I changed or rejected:**

<!-- TODO Zi Yi: add anything you edited by hand before committing. -->

**Verification.**

- Read every generated file before committing; each file header's `Author review:` line records
  what I checked.
- `npm test` (213 unit tests) and `npm run test:int` (41 integration tests against a real Redis).
- Ran all five flows against the compose stack with codes read from Mailpit: sign-up, five wrong
  passwords into a 423, refresh rotation, token reuse revoking every session, a full password
  reset, and the bootstrap admin claiming its account.
- **Checked the enumeration rules by measuring, not by reading the code.** An unknown address and
  a wrong password returned byte-identical 401s at 237 ms and 225 ms. `POST /auth/password/reset`
  returned byte-identical 400s for a real account and a made-up address, `attemptsRemaining` and
  all. Confirmed in `psql` that a reset revoked every refresh token (1 live → 0) and in Redis that
  an address with no account still gets an OTP record.
- For step 9, rehearsed the guarded `INSERT … SELECT … WHERE NOT EXISTS … ON CONFLICT DO NOTHING`
  in `psql` against PostgreSQL 17 before trusting it, then checked the concurrency claim with two
  real psql sessions, the first holding its transaction open while the second ran the same
  statement. No duplicate-key error and exactly one row afterwards, so two containers starting
  together cannot crash the boot.
- Ran the bootstrap on a **scratch database**, so the dev data was not wiped: migrations applied,
  then `ADMIN_BOOTSTRAPPED`, then a row with `role=ADMIN`, `status=ACTIVE` and NULL password,
  country code and mobile. Login before claiming gave 401; forgot → code from Mailpit → reset
  (204) → login returned `"role":"ADMIN"`, and the token decoded to the bootstrapped `sub`.
  Restarted twice more, once with a different address: both skipped, still one row.
- Confirmed step 9's three failure paths: an invalid or non-NUS address stops the boot with a
  message naming the variable and exit code 1; an unset variable boots normally and inserts
  nothing; demoting the only admin then restarting produced the "No ACTIVE admin exists" warning.
- Confirmed the tests actually catch what they claim, by breaking the service on purpose each
  time. Steps 5–8: removing the decoy record, letting the mail 503 through, dropping the status
  check, moving the lockout clear before the commit. Step 9: skipping normalisation, accepting a
  non-NUS address, putting the address in the audit event, running the no-admin query on the
  success path. Each failed the matching test and only that one.
- Grepped the service and startup logs for a plaintext `u.nus.edu` address: none.

**Mistakes worth recording.**

- A mutation written as `if (false)` stopped the file compiling, so Jest reported `Tests: 0 total`
  and that briefly read as "nothing caught it". A mutation has to stay compilable to prove
  anything. It happened twice, in step 8 and again in step 9.
- One `npm test` run reported 2 failures in 1 suite and was never reproduced — 11 later runs,
  including under CPU load, were clean, and the suite name was not captured. Recorded here rather
  than treated as fixed.

**Review findings acted on.** One finding on PR #15 (account creation and session issuance were
not atomic) — fixed by wrapping the insert and the first refresh token in one transaction, with a
test. One CodeQL alert (`js/insufficient-password-hash` on `hashOtp`) was a false positive: the
"password" it saw is the literal enum member name `PASSWORD_CHANGE`. Traced every call site before
dismissing it.

<!-- TODO Zi Yi: confirm the PR numbers in the heading — #17 and #18 were guessed before GitHub
     assigned them. -->
