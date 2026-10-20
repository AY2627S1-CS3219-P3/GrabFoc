<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Moved Zi Yi's section out of ai/usage-log.md into this file (issue #65); entry text unchanged.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Added the Order Service Phase A entry.
Author review (Zi Yi): Read the entry in full.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Added the Order Service Phase B entry.
Author review (Zi Yi): Read the entry in full.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Added the Order Service revised creation flow entry.
Author review (Zi Yi): Read the entry in full.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Added the single-migration entry.
Author review (Zi Yi): Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Added the Order Service Phase C entry.
Author review (Zi Yi): Reviewed; ran `npm test` and the `compose.test.yaml` tests.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: Added the courier timing-change entry.
Author review (Zi Yi): Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
Scope: Added the Order Service Phase D step 1 (credit settlement over Kafka) entry.
Author review (Zi Yi): Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Recorded the manual-check results Zi Yi reported, and the prompts that led to them.
Author review (Zi Yi): Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Added the Order Service Phase D expiry worker entry.
Author review (Zi Yi): Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Added the Order Service Phase D order.events and active-order lookup entry.
Author review (Zi Yi): Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
Scope: Recorded the manual-check results Zi Yi reported, and the prompts that led to them.
Author review (Zi Yi): Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
Scope: Added the Order Service Phase E tests entry.
Author review (Zi Yi): Reviewed
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
Scope: Added the Order Service Postman collection entry.
Author review (Zi Yi): Reviewed
-->

# AI Usage Log — Zi Yi

Zi Yi's entries for the FoC AI usage log. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). Add entries to this file only, newest first.

### 2026-10-19 — Order Service: Postman collection

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** new `order-service/postman/order-service.postman_collection.json`; `order-service/README.md`

**Scenario:** I asked whether a Postman collection would help. The AI said yes: User, Supplier and
Credit each have one, the frontend has no order pages for the D3 demo, and a collection can carry
the two tokens, `orderId` and `version` between requests, which is where my manual curl checks went
wrong. It noted Postman cannot show the background jobs.

**Prompts:**
> will postman collection be useful

> yes build the postman collection

> whats wrong (with a screenshot of the collection's variables)

> i have some errors (with two screenshots of the Runner results)

(two more screenshots, no text: the variables and a Runner result with a 401 on login)

**What it produced:** a collection of 47 requests in six folders, in the style of Credit's: setup
(log in as requester and courier, pick two `ACTIVE` locations), a full order through completion with
the courier's balance before and after settlement, requester and mutual cancellation, edit, error
cases, and the internal lookup. Every request has test scripts. Emails, password and service key are
empty variables, so nothing secret is committed. A README section on using it.

**Verification:** ran the whole collection with Newman against the local Compose stack: 47 requests,
89 assertions, no failures; the courier's balance rose by the 1-credit offer after settlement. The
first run failed every request because the URLs were written as Postman objects with only `raw`;
changed to plain strings.

**Debugging my own run:** first, every login failed because my variables named accounts that do not
exist locally (`INVALID_CREDENTIALS`); the AI pointed me to the existing test accounts and warned that
the password and service key were set to sync to my Postman cloud workspace. Then a create in folder 3
returned `409`: the requester had 2 credits left (earlier checks had paid couriers, and Credit's
database outlived Order's resets), and cancelled orders' credits only return about 10 s later. The
collection description and README now say a full run needs 5 available credits, and to swap the
accounts when the requester runs low.
Last, login itself returned 401: every Compose volume had been recreated at 18:57 UTC, so the
test accounts were gone. The AI registered them again (codes read from Mailpit), made the login
script skip saving when login fails instead of throwing a `TypeError`, and reran the collection:
47 requests, 88 assertions, no failures (the payment check is skipped while the courier has no
wallet yet).

Then I ran the collection in the Postman Runner myself: all passed.

**What I changed or rejected:** Reviewed the changed files.

### 2026-10-19 — Order Service: Phase E tests

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate
**Files:** `order-service/src/test/orders.api.test.ts`, `README.md`, `AGENTS.md`;
`docs/order-service-plan.md`

**Scenario:** Phase E of the plan (§8) is verification and the D3 demo. The AI compared each
Phase E test item with the existing 61 tests and added only what was missing.

**Prompts:**
> implement phase E

**What it produced:**
- three integration tests: one courier accepting two orders at once (one 200, one `COURIER_BUSY`,
  one history entry); expiry racing a timing approval both ways (an approval that commits first
  keeps the order; an expiry that commits first makes the later approval a 409); failed
  transitions (403, stale version, skipped/repeated step, cancel outside `PENDING`, answering a
  resolved proposal) add no history and publish no event;
- plan §8 Phase E ticks and §6 edge-case statuses updated to what the tests now cover; README test
  count; `AGENTS.md` status.

**Flagged:**
- Suspension/deactivation consumer tests stay blocked with the consumers.
- The full D3 demo needs a Notification Service, which does not exist yet; Order has been run with
  User, Supplier, Credit and Kafka.
- §6's Kafka-publish row was still "no outbox"; it now records the 2026-10-18 outbox decision.

**Verification:** `compose.test.yaml`: 64 tests passed. Removing the window recheck from
`lockExpired` made 1 test fail (the change was reverted).

**What I changed or rejected:** Reviewed the changed files.

### 2026-10-18 — Order Service: Phase D `order.events` and internal active-order lookup

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, explain, debug
**Files:** new `order-service/src/integrations/{kafka.producer,order.events}.ts`,
`src/common/service-key.guard.ts`, `src/orders/internal.controller.ts`; changed
`migrations/001_init.sql`, `src/{config,main,app.module}.ts`, `src/common/{errors,jwt-auth.guard}.ts`,
`src/integrations/credit.commands.ts`, `src/orders/orders.{service,repository}.ts`,
`src/test/{orders.api,database}.test.ts`, `compose.yaml`, `README.md`, `AGENTS.md`; root
`.env.example`; `infra/kafka/topics.txt`; `docs/order-service-plan.md`

**Scenario:** build what is left of Phase D that does not wait on other services. The AI checked
`origin/main`: the User Service publishes nothing on `user.events` and there is no
`supplier.events`, so the suspension/deactivation consumers stay blocked. It flagged the lookup
endpoint, the event payload and the outbox schema change as interface/schema decisions under the
AI policy and asked me to choose.

**Prompts:**
> implement remaining of phase D that can be implemented right now

> why is checking whether use has active users important again?

> what is the purpose of order_history_unpublished_idx

> list files changed and what they do, and the testing steps

> commit first

(a terminal screenshot of the first lookup check, no text)

(a second terminal screenshot of the same check, no text)

> relist the remaining testing steps with jq

> for check 2 i get null

(a terminal screenshot of check 2's output, no text)

> all checks passed, update the verification lines

**My decisions** (chosen from the options the AI laid out):
- Active-order lookup: `X-Service-Key` (new `ORDER_SERVICE_KEY`), returns `{ userId, hasActiveOrders }`;
  active = any status but `COMPLETED`/`CANCELLED`, as requester or courier.
- `order.events` delivery: `order_history` as the outbox (`published_at` column in `001_init.sql`),
  `eventId` = history entry ID. This changes plan §9's "no transactional outbox for events".
- Payload: plan §5 envelope plus `data.status`; six event types; nothing for create, edits or a
  create cancelled for credit; topic `order.events` (3 partitions) added to `topics.txt`.

**What it produced:**
- `KafkaProducer`, one connection shared by `CreditCommands` and the new `OrderEvents` publisher;
- `OrderEvents.publishPending`, every second from `main.ts` (for NFR3.4's 10 s): oldest first,
  keyed by `orderId`, marks `published_at` once Kafka stores the event, stops at the first failure;
- a partial index `order_history_unpublished_idx` for the publisher's query (checked with `EXPLAIN`);
- `ServiceKeyGuard` / `@Internal()` (constant-time key check; the JWT guard skips these routes),
  `SERVICE_KEY_INVALID`, and `GET /internal/orders/users/:userId/active`;
- five integration tests (lifecycle events in order with history IDs and no repeats; cancellation
  reasons and no event for a refused create; resend after Kafka was down; lookup auth; lookup
  results) and the index-count test updated to nine; doc updates.

**Flagged:**
- The partial index is an extra schema detail beyond the column I approved.
- Every teammate's root `.env` needs `ORDER_SERVICE_KEY` (≥ 32 characters) or Order won't start, and
  existing `order-db` volumes must be recreated (`001_init.sql` changed again).
- The User Service doesn't call the lookup yet, and no Notification Service reads `order.events`;
  both contracts need their owners' confirmation.
- The suspension/deactivation consumers stay blocked on User and Supplier events.

**Key responses:** explained why the lookup matters (the User Service must not deactivate or
suspend someone mid-order) and that the partial index keeps the 1 s publisher query cheap as
history grows. Debugging the manual check: the first lookup calls printed nothing because the repo
was on another branch with no Order Service running, and `curl -s` hid the connection error; the
AI's own `active` helper was wrong under zsh (it passed `-H "X-Service-Key: …"` as one word, so
the request was malformed) and was rewritten; the `null` in check 2 was most likely an access
token past its 15-minute lifetime, fixed by logging in again. Its check 2 instructions also wrongly
expected the completion response to say `COMPLETED` (it returns the confirmation's `APPROVED`).
A leftover `PENDING` order from the first attempt explained the lookup's extra `true`.

**Verification:** `compose.test.yaml`: 61 tests passed. Manual check with the real stack
(2026-10-19, run by me): all five checks passed: the lookup rejected a missing key, a wrong key and
a user token, rejected a non-UUID, and answered `true`/`false` correctly for requester and courier;
a full lifecycle published its five events in order with `eventId`s matching the history; a
requester cancellation and an expiry each published one `OrderCancelled` with the right reason;
with Kafka stopped the event waited unpublished and was sent after Kafka restarted, with
`ORDER_EVENT_PUBLISH_FAILED` logged only during that outage.

**What I changed or rejected:** Reviewed the changed files.

### 2026-10-18 — Order Service: Phase D expiry worker

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, explain, debug
**Files:** `order-service/src/main.ts`, `src/orders/orders.{service,repository}.ts`,
`src/test/orders.api.test.ts`, `README.md`, `AGENTS.md`; `docs/order-service-plan.md`

**Scenario:** implement the 60 s expiry worker from plan §8 Phase D, following the rules already
in plan §0/§2/§6 (expire `PENDING`/`ACCEPTED`/`PICKED_UP`/`IN_PROGRESS` once `now >= window_end`,
never `ARRIVED`; timing proposals `EXPIRED`, other pending proposals `SUPERSEDED`).

**Prompts:**
> implement the 60s expiry worker in phase D

> explain this function

> i am a little confused, try explaining again

> how to test the expiry worker

> use jq, relist the testing steps

> login failed, echo "A=$A_ID B=$B_ID pickup=$P delivery=$D" got nothing

> there is something wrong chenziyi@Chens-MacBook-Air-6 GrabFoc % docker compose up --build
> unable to get image 'foc-user-service': request returned 500 Internal Server Error for API route and version http://%2FUsers%2Fchenziyi%2F.docker%2Frun%2Fdocker.sock/v1.49/images/foc-user-service/json, check if the server supports the requested API version

> chenziyi@Chens-MacBook-Air-6 project % endnow $E1
> no configuration file provided: not found

> all checks passed, update the verification lines

**Key responses:** explained `supersedePending` (closes an order's waiting proposals of the given
kinds as `SUPERSEDED`, or `EXPIRED` for timing changes, in the same transaction as the order
change), first in full and then with two worked examples. Gave manual-check commands that push an
order's window into the past with SQL, since the API refuses already-ended windows. Debugging:
the login returned nothing because the setup step started only the Order Service and its
dependencies, not User, Supplier and Credit (fix: `docker compose up -d --build`); the 500 error
was Docker Desktop's engine not responding (fix: restart Docker Desktop); `endnow` failed because
it was run outside the repo folder, where `docker compose` finds no `compose.yaml`.

**What it produced:**
- `OrdersService.expireOrders`, run every 60 s from `main.ts` (each run after the previous one ends,
  like the settlement job): finds up to 100 expired orders, then for each one locks and rechecks it
  in its own transaction, cancels it, writes `CANCELLED` history (no actor, `reason: EXPIRED`) and
  resolves pending proposals; the settlement job then releases the credits;
- repository queries `expired()` and `lockExpired()`; `supersedePending` can now resolve as `EXPIRED`;
- three integration tests: each expirable state is cancelled and released while `ARRIVED`, unexpired
  and finished orders are untouched; pending proposals become `EXPIRED` / `SUPERSEDED`; an order a
  concurrent transaction moves to `ARRIVED` is skipped.

**Flagged:**
- No `OrderCancelled` event yet: it needs the `order.events` producer (next Phase D items).
- The history reason `EXPIRED` reuses the `OrderCancelled` reason name from plan §5.
- `order-service/AGENTS.md` still lists the expiry boundary and scheduler behaviour as **[Open]**,
  though plan §0/§6 already say `now >= window_end` every 60 s; left for me to settle.

**Verification:** `compose.test.yaml`: 56 tests passed. Manual check with the real stack
(2026-10-18, run by me): all four checks passed: an expired `PENDING` order was cancelled with
`reason: EXPIRED` and its credits returned; an expired `ACCEPTED` order was cancelled and its
pending timing change became `EXPIRED`; an `ARRIVED` order past its window stayed `ARRIVED`; no
`ORDER_EXPIRY_FAILED` in the logs.

**What I changed or rejected:** Reviewed the changed files.

### 2026-10-17 — Order Service: Phase D step 1 (credit settlement over `credit.commands`)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** new `order-service/src/integrations/credit.commands.ts`; changed `migrations/001_init.sql`,
`src/config.ts`, `main.ts`, `app.module.ts`, `integrations/credit.client.ts`,
`orders/orders.{service,repository}.ts`, `orders/confirmations.service.ts`,
`test/orders.api.test.ts`, `package.json`, `package-lock.json`, `compose.yaml`, `README.md`,
`AGENTS.md`; root `.env.example`; `docs/order-service-plan.md`; `credit-service/AGENTS.md`

**Scenario:** after merging Jian Bing's Kafka and Credit work, decide where Phase D continues.
The AI found that Credit consumes commands (`TransferCredits`, `ReleaseCredits` on
`credit.commands`) rather than the `OrderCompleted` / `OrderCancelled` events I had decided on
2026-10-15, and flagged the event-interface and schema choices under the AI policy.

**Prompts:**
> i have merged my teammate's kafka set up, we can continue implementing, where should we continue from

> explain the difference between commands and events

> i agree with having credit.commands for settlement and order.events for notification

> yes, go with 1-3 as recommended, but for migrations, edit 001 instead of having 002. should cleanUpCredits() be renamed? use clean-up job to act as outbox.
> Fake publisher in the automated tests, plus a manual check with Credit. The alternative is adding a Kafka broker to compose.test.yaml, which is slower but tests the real thing. explain more on this, why need another kafka broker?
> doc the credit side issue, credit owner shall handle it

> fake publisher vs kafka broker, whats the pros and cons of each, which are we using now

> update this accordingly, HTTP is only for reserving credits right? release and transfer of credits is via commands

> list steps for manual checks

> give me the explicit commands to copy and test

> jq command not found

> all sections passed, update the verification lines

**Key responses:** an event is a fact the publisher announces to anyone (the consumer decides what
it means); a command asks one service to do one thing (the sender decides). Suggested Phase D
order: credit commands, expiry worker, internal active-order lookup, `order.events`, then the
suspension/deactivation consumers (blocked: User and Supplier publish nothing yet).

**My decisions:** `credit.commands` for settlement, `order.events` for Notification. Rename the
column to `credit_settled_at` by editing `001_init.sql` (teammates recreate the volume). The
settlement job is the outbox. Fake producer in the automated tests, plus a manual check with
Credit. The Credit owner handles releases for unknown orders.

**What it produced:**
- a Kafka producer (`@confluentinc/kafka-javascript`, as in Credit) sending `TransferCredits` /
  `ReleaseCredits`, keyed by `orderId`;
- `cleanUpCredits` renamed `settleCredits`: it also sends transfers for `COMPLETED` orders and
  marks `credit_settled_at` once Kafka stores the command; each run waits for the previous one;
- no release after `INSUFFICIENT_CREDITS`, since Credit kept nothing;
- HTTP release removed (reserve stays on HTTP); `ORDER_KAFKA_BROKERS`; Compose waits for `kafka-init`;
- tests rewritten around a fake producer (transfer on completion, releases, Kafka down, no resend);
- doc updates, and the Credit open item.

**Flagged:**
- Root §3's [Decided] Communication bullet said HTTP for reserve, transfer and release. At my direction it
  now says HTTP for reserve only, with transfer and release as `credit.commands`; the team still has to
  confirm it, and the mentor to validate it.
- The migrator does not detect edited files, so an old `order-db` volume keeps `credit_released_at`
  and the service fails until it is recreated (`down -v`).
- Credit dead-letters a `ReleaseCredits` for an unknown order (`HOLD_NOT_FOUND`); recorded for
  the Credit owner with the `RELEASED` marker.

**Verification:** `compose.test.yaml`: 53 tests passed. The runtime image loaded the Kafka client.
Manual check with the real Kafka and Credit (2026-10-18, run by me): all five sections passed:
completion pays the courier, cancellation returns the requester's credits, insufficient credits
sends no command, and a cancellation while Kafka was stopped settled after it restarted.

**What I changed or rejected:** Reviewed the changed files.

### 2026-10-16 — Order Service: courier can propose timing changes

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate
**Files:** `order-service/src/orders/confirmations.service.ts`, `src/test/orders.api.test.ts`,
`README.md`, `AGENTS.md`, `docs/order-service-plan.md`

**Scenario:** change the [Decided] rule (2026-10-13) that only the requester proposes a
`TIMING_CHANGE` after acceptance.

**Prompts:**
> why only requester can propose timing change?

> allow both requester and courier to propose timing change

**My decision:** either participant can propose a timing change; the other approves or rejects.

**What it produced:** removed the requester-only 403 check; the test now has the courier propose
one in `PICKED_UP` (courier ACCEPTED, requester PENDING); the three docs record the change.

**Flagged:** this changes a [Decided] team rule, so the team needs to be told.

**Verification:** `compose.test.yaml`: 53 tests passed.

**What I changed or rejected:** Reviewed the changed files.

### 2026-10-16 — Frontend: forgot-password feedback (issue #63)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** debug, generate
**Files:** `frontend/app/components/recovery-screen.tsx`, `frontend/test/routes.test.mjs`

**Scenario:** forgot password gave no feedback when the email had no account; fix it on the
frontend only, as the issue proposes.

**Prompts:**
> on the current fix/frontend-frogot-password, handle the issue https://github.com/AY2627S1-CS3219-P3/GrabFoc/issues/63

**What it produced:** the reset step now shows the issue's wording ("If an account exists for
that email, we've sent a 6-digit code. It expires in 5 minutes. …") after a forgot-password
request, for every account the same way. Removed the `message` state, which was never set. Added
an assertion for the notice to the unknown-account recovery test. No API or backend change.

**Verification:** `npm run lint` clean; `test:routes` 36/36 passed, run on Chrome through a
temporary copy because the suite hard-codes the `msedge` channel.

**What I changed or rejected:** _(pending my review)_

### 2026-10-15 — Order Service: Phase C (lifecycle, cancellation, confirmations)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** new `order-service/src/orders/confirmations.{controller,service}.ts`; changed
`orders/orders.{controller,service,repository,schemas}.ts`, `common/errors.ts`, `app.module.ts`,
`test/orders.api.test.ts`, `README.md`, `AGENTS.md`, `docs/order-service-plan.md`

**Scenario:** implement Phase C of the plan. Before writing code, the AI flagged three design
points under the AI policy (credit settlement, confirmation API shapes, expired orders). I asked
for explanations and made the decisions.

**Prompts:**
> implement phase C, list the files changed/created and what they do

> explain the credits question more, whats the difference between using http and kafka events

> why can we have the credit reservation part using http, then for completed or cancelled orders use events?

> for the credit reservation, if anything goes wrong, actually the release cna also use event?

> the final implementation should be reserve is HTTP, release and transfer to be events. but since phase D is not ready to be implemented yet, we can implement as HTTP first? or we jsut implement what we can for now, and wait for the kafka to be set up?

> (question answers) Credits: "Yes, as recommended"; Confirmation API: "As previewed (Recommended)"

> whats the pros and cons

> yes, go with that and implement phase C

**Key responses:** explained HTTP vs Kafka for settlement (HTTP plus the clean-up job never loses
a release because the `orders` table tracks it; Kafka without an outbox can lose an event between
commit and publish). Pointed out that root `AGENTS.md` §3 records HTTP for transfer and release,
which conflicts with the plan's events. Laid out the pros and cons of refusing or allowing
actions on expired orders before the Phase D worker.

**My decisions:** final design is reserve over HTTP, release and transfer as events. For now
the clean-up job keeps releasing cancellations over HTTP, and completions stay held until Phase D.
The confirmation API is as previewed. Expired orders refuse lifecycle steps and timing changes,
but cancellation stays allowed.

**What it produced:**
- the courier steps `pick-up`, `start-delivery` and `arrive`;
- requester cancellation of `PENDING` orders;
- proposing, listing and answering `TIMING_CHANGE`, `CANCELLATION` and `COMPLETION` confirmations,
  with the order and proposal locked and rechecked in one transaction;
- the `CONFIRMATION_PENDING` error code;
- 11 HTTP tests;
- doc updates recording the decisions.

**Flagged:**
- `arrive` marks a pending `TIMING_CHANGE` `SUPERSEDED`. Otherwise it would block `COMPLETION`.
  This is **[Proposed]**, because it extends SUPERSEDED beyond terminal actions.
- Root §3 still needs a team update for events.
- The D3 demo needs transfer, so if Kafka is late, an HTTP transfer fallback may be needed.

**Verification:** `compose.test.yaml`: 53 tests passed (12 unit, 14 database, 27 HTTP).

**What I changed or rejected:** Reviewed the generated files and ran `npm test` and the `compose.test.yaml` tests.

### 2026-10-15 — Order Service: one migration file

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** refactor
**Files:** `order-service/migrations/001_init.sql` (changed), `002_credit_reservation.sql` (deleted),
`src/test/database.test.ts`, `README.md`, `AGENTS.md`, `docs/order-service-plan.md`

**Scenario:** keep the Order schema in a single migration.

**Prompts:**
> under migrations/, i want only one migration

**What it produced:** folded `002_credit_reservation.sql` into `001_init.sql` (`AWAITING_CREDIT` in
the status checks and the no-courier rule, the `CREDIT_RESERVED` history action, the nullable
`orders.credit_released_at`), deleted 002, and updated the tests and docs that named it. Same
schema as before; no design change.

**Flagged:** a database that has already applied the old `001_init.sql` won't pick up these
changes, because the runner tracks applied files by name; it has to be recreated.

**Verification:** `compose.test.yaml`: 42 tests passed (12 unit, 14 database, 16 HTTP).

**What I changed or rejected:** Reviewed the generated files.

### 2026-10-15 — Order Service: revised creation flow (credit release and clean-up)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** new `order-service/migrations/002_credit_reservation.sql`; changed
`integrations/credit.client.ts`, `orders/orders.{service,repository,schemas}.ts`, `main.ts`,
`test/orders.api.test.ts`, `test/database.test.ts`, `README.md`, `AGENTS.md`,
`docs/order-service-plan.md`

**Scenario:** questions about the Phase B code led to the stuck-credit problem in insert,
reserve, commit; I compared fixes, drafted a message for my teammates, and had the plan and code
revised to the flow I chose.

**Prompts:**
> should this part be here or in src/common/zod-validation

> is it better to ask supplier service to give us the exact fields we want so we can use .strict()

> what does this mean _(on the comment about a lost Credit reply leaving a hold)_

> yes change it to Known limitation. what are the possible ways to solve this issue. also list the issue here

> if we implement release after failure, then how cna we handle the case where the credit is down when Order sends the release? should this release by sent as event or what?

> what is commonly used though.

> write the case, issue, common way to solve it as a message here, i will send it to chekc with my teammate

> how are we implementing it right now? the transaction and sync call right

> if i implement release on failure and outbox, there is still the issue of timing gap. what if before credit commits, check order

> _(pasted proposed flow)_ Order creates a committed PENDING record. Order requests a credit reservation. Credit checks that the order is PENDING. If the reservation succeeds, Order commits the actual order and changes its status to CONFIRMED. If creation fails, Order changes the status to CANCELLED and records a release request in its outbox. Credit processes the release. Even if no reservation exists yet, it records a cancellation marker so that a late reservation cannot succeed. A background worker retries failed releases. — what about this

> update the plan and the code according to the revised flow

**Key responses:** keep Supplier's response schema in the client and non-strict (tolerant
reader); the stuck-hold cases (lost reply, failed commit) and the timing gap where a release
beats a slow reserve; options compared (release on failure, retry, commit first, Credit sweep,
outbox, events), with saga plus transactional outbox plus reconciliation named as the usual
practice; a Credit-side check of Order cannot close the gap (uncommitted row, check-then-act),
a `RELEASED` marker on Credit's primary key can. On the pasted flow it advised a new
`AWAITING_CREDIT` state instead of reusing `PENDING`/adding `CONFIRMED`, dropping the
Credit→Order check, and a job that also cancels stuck creates, with the `orders` table as the
outbox.

**Design input flagged:** Claude Code warned each time that the new state, column, background
job, Credit release behaviour and replacing my earlier insert-reserve-commit decision are
schema, architecture and interface decisions under the AI policy, to confirm with the team and
the Credit owner. I told it to update the plan and code; the Credit `RELEASED` marker was not
implemented (it belongs on `feature/credit-service`).

**What it produced:** migration 002 (`AWAITING_CREDIT`, `CREDIT_RESERVED` action,
`credit_released_at`); create now saves `AWAITING_CREDIT`, reserves outside any transaction,
opens the order as `PENDING`, or cancels it and calls release; `CreditClient.release`;
`OrdersService.cleanUpCredits` run every 10 s from `main.ts`; plan §0/§1/§2/§4/§6/§8/§9/§10,
README and AGENTS.md updated; the teammate message.

**Verification:** `compose.test.yaml`: 42 tests passed (12 unit, 14 database, 16 HTTP), including
failed reservations cancelling and releasing, and the clean-up job retrying releases while
Credit is down and cancelling only stale `AWAITING_CREDIT` orders.

**What I changed or rejected:** Reviewed the generated files.

### 2026-10-15 — Order Service Phase B: create, edit and accept

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, debug
**Files:** new `order-service/src/integrations/supplier.client.ts`, `integrations/credit.client.ts`,
`orders/timing.ts`, `orders/timing.spec.ts`; changed `config.ts`, `app.module.ts`,
`common/errors.ts`, `common/zod-validation.pipe.ts`, `orders/orders.{controller,service,repository,schemas}.ts`,
`test/orders.api.test.ts`, `compose.yaml`, both `.env.example` files, `README.md`, `AGENTS.md`

**Scenario:** implement Phase B of `docs/order-service-plan.md` on top of Phase A.

**Prompts:**
> implement phase B with the corresponding tests, list the steps for me to run testing on my own, list the new files you added and what they do. keep the code implementation clean, and keep comments concise, avoid unnecessary files

> we should Insert, reserve, commit. ask Credit to reserve, and commit only if the reservation succeeded

**Design input flagged:** Claude Code warned that sequencing the Credit reservation against the
Order insert is an [Open] consistency trade-off under the AI policy and asked me to choose. I
chose insert, reserve, commit. It also flagged, without choosing for the team: forwarding the
caller's token to Supplier, campus time (UTC+8) for opening hours, equal open/close times as
24 hours, the new error codes, and the conflict between the plan's direct Supplier HTTP calls
and root AGENTS.md §3's query events.

**What it produced:** `POST /orders` (window defaults/validation, both locations ACTIVE via
Supplier, pickup-hours overlap including overnight hours, snapshots, CREATED history, Credit
reserve inside the open transaction); `PATCH /orders/:orderId` (requester-only, PENDING-only,
version-guarded, snapshot refresh, EDITED history with from/to values); `POST
/orders/:orderId/accept` (one conditional update, COURIER_BUSY from the partial unique index,
ACCEPTED history). Matches Credit's existing `/internal/credits/reserve` contract.

**Verification:** `compose.test.yaml`: 41 tests passed (12 unit, 14 database, 15 HTTP against a
fake Supplier/Credit server, including insufficient credits rolling back and two couriers
accepting at once). Container refused to start without `ORDER_CREDIT_SERVICE_KEY` and started
with it.

**What I changed or rejected:** Reviewed the generated files.

### 2026-10-14 — Order Service Phase A: NestJS and basic access

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, debug
**Files:** `order-service/src/**` (new `main.ts`, `app.module.ts`, `config.ts`, `auth/`, `common/`,
`db/database.module.ts`, `health/`, `orders/`, tests), `order-service/package.json`,
`tsconfig.json`, `Dockerfile`, `compose.yaml`, `.env.example`, `README.md`, `AGENTS.md`,
root `.env.example`, `ai/usage-log/jie-yang.md` (merge resolution)

**Scenario:** implement Phase A of the team's consolidated `order-service-plan.md` on top of
Jie Yang's database foundation branch.

**Prompts:**
> Refer to the created plan order-service-plan.md, implement phase A with respective tests required. After you are done, summarise the code structure and folder structure. Try to keep the code implementation clean, keep comments concise too, structure of code and folder should be organised

**What it produced:** merged `origin/feat/order-service-implementation` into
`feat/order-service`, moving that branch's Order log entries into `jie-yang.md` (main had
split the log). Added a NestJS server: RS256 JWKS verification with `jose` (401 bad token,
503 keys unreachable), strict Zod paging/ID validation, the User Service error envelope,
structured request and UNAUTHORISED_ACCESS log lines, `/health` and `/health/ready`, and
`GET /orders/available|mine|assigned|:orderId|:orderId/history` with participant checks and
`{ items, page, pageSize, total }` pagination. Runtime image now serves HTTP on 3005;
`order-migrate` overrides the command.

**Design input flagged:** response shapes, paging parameters, health paths and port 3005 are
not in the plan; they copy Supplier/User conventions and are marked [Proposed] for the team.

**Verification:** `npm test` (7 unit tests) and `compose.test.yaml` (27 tests: unit, 14
existing database tests, 6 new HTTP tests against PostgreSQL 17 with a stub JWKS) passed.
Compose stack smoke test: migration then `order-service` started, `/health/ready` 200,
`/orders/mine` 401 without a token.

**Follow-up prompt:**
> move auth files into common/ and the health/ is not required

**What I changed or rejected:** moved the JWT guard and its tests into `src/common/`; removed
the `/health` and `/health/ready` endpoints and the now-unused `@Public` decorator. Tests
re-run: 27 passed.

**Later prompts (explain / formatting):**
> list the steps so i can do testing on my own

> what is paging about?

> update the author review lines for me

> yes update the usage log too

Claude Code listed manual test steps and explained the paging design. It declined to write
review checks I had not stated and asked what I had actually done; the `Author review` lines
in every Phase A file header now record only those checks.

**Author review:** I read every Phase A file in full and ran `npm test` (7 passed) and the
`compose.test.yaml` integration tests (27 passed). The manual end-to-end steps have not been
run yet.

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
