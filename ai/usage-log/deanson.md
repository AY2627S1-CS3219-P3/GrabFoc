<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Moved Deanson's section out of ai/usage-log.md into this file (issue #65); entry text unchanged.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Condensed every entry to the template fields (scenario, prompts, output, decisions, verification); prompt text left unchanged.
Author review: Pending Deanson's review.
-->

# AI Usage Log — Deanson

Deanson's entries, newest first. The template and rules (Appendix 2 of the project document) are in
[`ai/usage-log.md`](../usage-log.md): exact prompts, summarised responses, what was changed or
rejected, and how it was verified.

### 2026-11-09 — Frontend endpoint audit and removing the header avatar (branch `feat/frontend-fixes`)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, refactor
**Files:** `frontend/app/components/app-shell.tsx`, `frontend/app/globals.css`

**Scenario:** I asked which backend endpoints the frontend doesn't use yet, how the profile picture is shown and whether user data is kept in browser storage. Then I had the AI remove the placeholder "?" circle at the top right of the header.

**Prompts (exact, in order):**
> for the frontend profile, how is the profile picture displayed?

> is user information stored in localStorage?

> remove the top right circle from frontend completely, clarify before proceeding

**Clarifying answers (mine):** remove both the span and its `.header-avatar` CSS rule; keep the mode chip; add file headers and this log entry.

**What it produced:**
- An audit comparing the gateway route files with the frontend's calls. The unused non-admin endpoints are the seven `/users/me` self-service routes (PATCH profile, OTP, email change and verify, password, mobile, deactivate) and `GET /locations/:id`.
- An explanation that the profile "picture" is the first letter of the display name (the header circle was a hardcoded "?"), and that the backend has no image field.
- An explanation that tokens are in httpOnly cookies, that `sessionStorage` holds only short-lived values (pending registration or reset email, the logout notice), that the profile is kept only in the in-memory React Query cache, and that nothing uses `localStorage`.
- Removed the header avatar span and its CSS rule.

**Verification:** no `header-avatar` references are left outside the disclosure comment. Frontend `tsc` passes, and ESLint passes on `app-shell.tsx`. Route tests not run. Not yet checked by me in the running app.

### 2026-11-09 — Profile page order totals and `GET /orders/assigned?status=` (branch `feat/frontend-fixes`)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate, debug
**Files:** `order-service/src/orders/orders.{schemas,controller,service,repository}.ts`, `order-service/src/test/orders.api.test.ts`, `order-service/README.md`, `frontend/lib/orders.ts`, `frontend/app/profile/page.tsx`, `frontend/test/routes.test.mjs`

**Scenario:** the Profile page's Orders Requested and Orders Delivered cards showed "—". I asked how orders are listed and counted today, then had the AI fill the two totals. The AI flagged that a new `status` query is an API interface change under the AI policy; I confirmed it.

**Prompts (exact, in order):**
> currently, is there an endpoint whereby we can check the number of orders a user requested or delivered either indrirectly or directly?

> currently, how is the frontend displaying assigned orders and my orders in the 'My Orders' page? is it manually filtering on the frontend?

> It's fetching every page? Is it not fetching page by page and filtering by status accordingly?

> GET /orders/mine
> GET /orders/assigned
>
> what do these two endpoints require in terms of queries, and what is the payload returned in JSON

> TASK:
> - I want the Orders Requested and Orders Delivered data to be filled in the frontend (on the Profile Page)
>
> - For the orders assigned endpoint, add a status query for completed orders so that we can return orders delivered. Use pageSize of 1 and page = 1. This endpoint is used to fill the data Orders Delivered
> - For the orders/mine endpoint, it also uses pageSize of 1 and page = 1. This endpoint is used to fill the data Orders Requested.
> - In the meantime, also remove the line 'orde rtotals and credits earned will appear when Order service intergration is ready' from the frontend (profile page)
>
> Clarify before proceeding

**Clarifying answers (mine):** confirmed the interface change; `status` accepts any single order status; added to `/orders/assigned` only (Orders Requested counts every status, cancelled included); Credits Earned keeps showing "—".

**What it produced:**
- An optional `status` query on `GET /orders/assigned` (strict Zod enum of all 8 statuses, parameterized SQL, applied to `items` and `total`).
- `countOrders()` in `frontend/lib/orders.ts`, and the Profile page reading `total` from `mine?page=1&pageSize=1` and `assigned?status=COMPLETED&page=1&pageSize=1`, with a Retry on error and 401 → sign in.
- The "integration is ready" note removed.
- An API test, a proxy route case, and a README row update.

**Debugging:** two frontend route tests failed after the change.
- The test gateway echoed `/orders/*` list calls without `items`/`total`, so Home crashed once its list loaded. Before, the test only passed by clicking Profile before that response arrived. The stub now returns an empty page for the list routes.
- The no-wallet test counted every forwarded request, and the new order-total calls raced it. It now counts Credit requests only.

**Verification:** order-service `tsc` clean, unit tests 14/14, `compose.test.yaml` integration tests 83/83 (new test included). Frontend `tsc` and ESLint clean; `npm run test:routes` with `FOC_TEST_BROWSER_CHANNEL=chrome` 47/47 (twice; baseline without the change was also 47/47). Not yet checked by me in the running app.

### 2026-11-09 — Order timing window in the Create/Edit Order modal (branch `feat/frontend-fixes`)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** `frontend/app/components/order-form-modal.tsx`, `frontend/lib/orders.ts`

**Scenario:** the modal showed the timing window as read-only text, so requesters couldn't set one. I checked the create-order contract first, then had the AI add the inputs. 

**Prompts (exact, in order):**
> What is the create orders endpoint? and its expected payload?

> windowStart and windowEnd expected formatting? it is UTC + 8 (ISO 8601?)

> On the frontend, for the create order modal, do new Date(localInput).toISOString() for windowStart and windowEnd. Also, do a simple check on the frontend that the windowStart and windowEnd is valid in the sense that windowStart < windowEnd
>
> Clarify that u understand before proceeding

*(The AI pointed out the modal had no time inputs yet and asked three questions. I chose: the fields are optional, so a blank one uses the server default; check only when both are filled; apply to edit too. Plan mode: I approved the plan.)*

**What it produced:** the explanation that `POST /orders` takes any ISO 8601 offset (`Z` or `+08:00`), and that UTC+8 is only used on the server for the opening-hours check. In the modal, `datetime-local` inputs replace the read-only boxes, and filled values are sent with `new Date(value).toISOString()`. A start-before-end check runs before submitting. On edit the inputs are prefilled with the order's window, only changed times go in the PATCH, and a cleared field keeps the current time. `OrderInput` gained optional `windowStart` / `windowEnd`.
**What I changed or rejected:** I extended the change to edit mode, beyond my first ask. The check doesn't look at past times or opening hours; the server enforces those.
**Verification:** `tsc --noEmit` and eslint on both files are clean. The modal has no automated tests. Manual browser check pending.

### 2026-11-08 — Real-time chat frontend, phase 2 (branch `feature/chat`)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate
**Files:** `frontend/app/orders/[id]/{page.tsx,order-page.tsx,order-chat.tsx}`, `frontend/lib/chat.ts`, `frontend/app/api/session/orders/[[...path]]/route.ts`, `frontend/test/routes.test.mjs`, `frontend/app/globals.css`, `frontend/compose.yaml`, `frontend/package.json` + lock (`socket.io-client`), `.env.example`, `chat-service/AGENTS.md`

**Scenario:** build the browser side of the chat plan on top of the phase 1 backend, so requester and courier can chat on the order page.

**Prompts (exact, in order):**
> read chat-service latest session as well as chat-service/plan.md and understand whats happening

*(The AI summarised the state and asked what next; I picked "Plan the frontend (§8)". Plan mode: the AI wrote a plan; I approved it.)*

**What it produced:** `chat-ticket` in the Order proxy allowlist (+ test); the order page split into a server `page.tsx` (reads `CHAT_SOCKET_URL` / `CHAT_SOCKET_PATH` per request with `connection()`) and the client `order-page.tsx`; the `OrderChat` component (ticket `auth` function, backoff on `try again`, history / older pages / catch-up with `syncedId` and `oldestId`, merge by `id`, Sending… / Not sent + Retry with the same `clientMsgId` / Dismiss); chat styles; compose and `.env.example` entries.
**What I changed or rejected:** — Choices the AI made and flagged for me: the UI copy ("Chat opens once a courier accepts the order.", "Chat closed.", the status line); helpers in a new `lib/chat.ts`; a session 401 while fetching a ticket goes to `/signin`, but chat refusing a ticket Order issued shows "Chat refused the connection" instead (plan §8 sends every `unauthorized` to login).
**Verification (by the AI, to be repeated by me):** ESLint and `tsc` clean; `npm run build` passes (`/orders/[id]` dynamic); route tests 47/47 (`FOC_TEST_BROWSER_CHANNEL=chrome`, as Edge isn't installed); frontend container rebuilt, env values confirmed inside it. 

### 2026-11-08 — Real-time chat backend, phase 1 (branch `feature/chat`)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, debug
**Files:** `chat-service/**` (new service), `order-service/src/{config.ts,orders/chat-ticket.ts,orders/orders.service.ts,orders/orders.controller.ts,test/orders.api.test.ts}`, `order-service/compose.yaml`, `order-service/README.md`, `api-gateway/envoy/{render.py,compatibility.lua,routes/30-order.routes.json,routes/50-chat.routes.json}`, `api-gateway/test/*`, `api-gateway/{compose.yaml,.env.example,AGENTS.md}`, `compose.yaml`, `.env.example`, `.github/workflows/ci.yml`, `AGENTS.md`

**Scenario:** implement the backend half of the chat plan (Order's chat ticket, the chat service, the gateway, plus compose, env, CI and docs), so I can test it by hand in Postman before any frontend work.

**Prompts (exact, in order):**
> Read chat-service/plan.md
>
> I would like you to focus on building the backend first, and let me test via postman manaully before you move on to building the frontend

*(Plan mode: the AI wrote a 4-step plan; I approved it.)*

**What it produced:** `POST /orders/:orderId/chat-ticket` (403 unless participant and ACCEPTED/PICKED_UP/IN_PROGRESS/ARRIVED; HS256, `aud: chat`, 10 s); the NestJS + Socket.IO chat service (ticket middleware, `getHistory` / `getMissedMessages` / `sendMessage`, idempotent save, migrations, `/health`); Envoy WebSocket upgrades, the `"websocket"` route field (60 s idle) and the public chat route; tests for all three; a chat Postman collection and a terminal client (`npm run try-chat`).
**What I changed or rejected:** — Gaps the AI filled and flagged for me: the failed-ack `error` is a string `"<field>: <reason>"`; a separate chat Postman collection instead of a folder in Order's.
**Verification (by the AI, to be repeated by me):** chat unit tests 10/10, chat DB + socket tests 8/8 (PostgreSQL 17 in Docker); Order unit 13/13 and integration 68/68; gateway unit tests 16/16 and Envoy integration 28/28 (on a copy of the local Envoy image with the new files added.

### 2026-10-22 — Condense this log

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** refactor
**Files:** `ai/usage-log/deanson.md`

**Scenario:** the log had grown excessively; I had the AI shorten it to the template fields.

**Prompts (exact, in order):**
> can you concise deanson-log.md based on the AI policy requirements. clarify before prcoeeding

> *(answers)* Scope: Whole file. Prompts: Keep every prompt verbatim. Depth: Template fields, short bullets.

**What it produced:** every entry rewritten as short bullets under the template headings; stray headings and the duplicate intro removed.
**What I changed or rejected:** —
**Verification:** a script diffed every `>` prompt line before and after (no differences); the entry count is unchanged. Still to do (me): read the rendered file.

### 2026-10-22 — Colour-coded status badges

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, verify
**Files:** `frontend/lib/orders.ts`, `frontend/app/components/order-card.tsx`, `frontend/app/orders/[id]/page.tsx`, `frontend/app/globals.css`, `docs/orders/frontend-integration-plan.md`

**Prompts (exact, in order):**
> For the frontend, can status badges be color coded. awaiting -> gray pending -> light blue accepted -> blue pciked up -> blue in_progress -. blue arrived -> blue completed -> green cancelled -> red create a constants table or constants file to store these values. clarify befoer prcoeeding

> *(answers)* File: inside lib/orders.ts. Colours: hex values in the TS constants. Scope: order cards and the order detail page. Shades: the soft palette.

**Who decided:**
- **Me:** the colour for each status; the constants go in `lib/orders.ts`; inline hex values; badges on the cards and the detail page.
- **AI proposal I accepted:** the soft palette (gray, light blue, blue, green and red background/text pairs).
- **AI implementation details:** a shared `StatusBadge`; on the detail page it replaces the "Awaiting credit" pill.

**Verification:** `tsc`, lint and build pass; route tests 40/40. After a rebuild, headless Chrome screenshots of the cards and the detail page showed the expected colours, using a temporary `PENDING` order that was then cancelled.

### 2026-10-22 — Endpoint questions, and Orders page sections

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate, verify
**Files:** `frontend/app/orders/page.tsx`, `frontend/lib/orders.ts`, `frontend/app/globals.css`, `docs/orders/frontend-integration-plan.md`

**Scenario:** I asked about problems and plan divergences, then about several endpoints. Then I split the Orders page into three sections.

**Prompts (exact, in order):**
> Any issues you encounted or design choices diversion from plan?

> Can i check that u logged my latest ai-usage already

> List all supplier endpoints, short description of what they do, and the response returned

> does pickup location and dropoff location in the create orders form currently use the data from GET /locations?

> endpoint for GET orders

> GET /orders/:orderId/history what does this endpoint return??

> how to call it using postman GET /orders/mine

> how to check credits of a particular user?

> List all GET endpoints for order-service and their responses

> for the frontend, is it currently filtering out completed and cancelled orders?

> Do this instead: for both tabs, section them into: 1. Active 2. Completed 3. Cancelled clarify before prcoeeding

> *(answers)* Data: Fetch all, group locally. Layout: Stacked, history collapsed. Card click: Not clickable. Credit fail: Show them.

**Key responses:**
- Issues: Edge isn't installed, so tests ran on a Chrome copy; the build's `tsconfig.json` edit was reverted; the gateway test ports changed; a create-redirect bug was fixed. It also listed 13 divergences from the plan.
- Endpoint answers explained existing code only (Supplier endpoints, form dropdowns from `GET /locations?pageSize=100`, Order GET endpoints, Postman steps, `GET /credits/:userId`).
- It flagged a backend status filter as an API change under the AI policy. I chose a frontend-only change.

**Who decided:**
- **Me:** three sections, fetching all orders and grouping them locally, history collapsed, finished cards not clickable, credit-cancelled orders shown.
- **AI implementation details:** at most 10 pages of 100, duplicates removed by `id`, native `<details>`, counts in the headings.

**Verification:** `tsc`, lint and build pass; route tests 40/40. After a rebuild, headless Chrome on test account A showed Active 0 / Completed 1 / Cancelled 2 with history collapsed, at 1280 px and 390 px. Still to do (me): check it in my own browser.

### 2026-10-22 — Order Service ↔ frontend integration (implementation)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, verify
**Files:**
- `api-gateway/`: new `envoy/routes/30-order.routes.json`; changed `compose.yaml`, `.env.example`, `README.md`, `envoy/README.md`, `AGENTS.md`, two tests
- `frontend/`: new order proxy route, `providers.tsx`, `orders/` pages, four components, `lib/orders.ts`; changed home, layout, app shell, session status, `session-client.ts`, `locations.ts`, `globals.css`, route tests, `package.json` (`@tanstack/react-query` 5.104.5)
- `docs/orders/frontend-integration-plan.md`

**Scenario:** implement §7 of my integration plan.

**Prompts (exact, in order):**
> Read docs/orders/frontend-intergration-plan.md and calrify before proceeding

> *(answers)* After accept: Open /orders/:id. Card click: Not clickable. Awaiting: Show with status. Manual test: "elaborate", then "A: I do API, you do browser".

> *(rejected the plan-approval prompt)* Can you write down order-service endpoints that are not currently being implemented in the plan too (under deferred decisions)? after that start implementation plan based on the plan layed out in frontend-integration-plan.md

**Who decided:**
- **Me:** everything in the plan, plus the four answers above.
- **AI implementation choices, flagged for my review:** optional catch-all proxy; redirect to `/home?notice=order-unavailable` on 400/403/404; "View order" link after create; shared `useSession`; no retries on 4xx; native `<dialog>`; heading stacks on phones.
- No API, schema or event changes. Jie Yang approved the gateway route on 2026-10-22.

**Verification:**
- Lint and build pass. Route tests 40/40 (3 new). Gateway tests 5/5 and 20/20.
- A scripted two-user run through the gateway passed 35 checks across the order lifecycle, 401 and `/internal` not routed.
- Still to do (me): the two-browser UI pass, the phone-width check, and the "Author review" lines.

### 2026-10-22 — Order Service ↔ frontend integration plan

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** new: `docs/orders/frontend-integration-plan.md`

**Scenario:** before connecting the frontend to the Order Service, I asked how the endpoints and the frontend behave. Then I dictated the screen requirements, and the AI wrote them up as a plan.

**Prompts (exact, in order):**
> Can you create a plan under docs. I am planning to integrate orders-service backend with frontend. I will give the details

> *(answers)* Scope: "I will say, u adjust later". File: `docs/orders/frontend-integration-plan.md`.

> *(pasted my screen requirements: Home page (remove the active/accepted sections, a create
> button and modal, POST /orders, poll GET /orders/available every 10 s with React Query, accept
> button); Orders page (requester/courier tabs polling /orders/mine and /orders/assigned, cards,
> pencil edit and red-cross cancel for PENDING); /orders/:id page (poll, "viewing as", a lifecycle
> line, details on the left, chat placeholder on the right); deferred: window logic and backend
> caching with Redis)* Write these points in the plan first. I will add on proposal / state transitions later

> *(answers)* Dropdowns: Locations. Wording: Create Order.

> *(quoted the two items needing confirmation: the gateway route and the user id in session status)* checked and approved

> List all relevant endpoints from Accepted State onwards that is involved in state transitions / proposals. For each endpoint, include a short desciprtion, its expected input if any (body, params, queries) , who can call it and the response it outputs

> Add to plan for orders/:id page, if status is cancelled, redirect user back to home pqage

> does GET /orders/:orderId/confirmations list rejected proposals too..

> does GET/orders/mine or GET/orders/assigned return canceleld or completed orders too?

> add these to plan: - only display those orders that are not COMPLETED or not CANCELLED

> *(answer)* Filtering: Filter in frontend. The AI had pointed out that a backend `status` filter would be an API change under the AI policy.

> Is there anything you need to clarify before implementing the plan

> *(answers)* UI library: Match existing style. Branch: New branch from here. Delivery: All at once.

**What it produced:** endpoint answers (no Redis in the Order Service; the AI declined to invent a reason for the deferral); the gaps found (no Order proxy or gateway route, no React Query, no user id in the session status); the plan, including §7 "Implementation steps".

**Who decided:**
- **Me:** every screen requirement, 10 s polling, the deferrals, list locations in the dropdowns, "Create Order".
- **AI proposals approved on 2026-10-22:** the `/orders/**` gateway route (checked with Jie Yang) and `sub` in `/api/session/status`.
- **AI implementation details:** the proxy route copied from Supplier's, query keys, error handling, testing steps.

**Verification:** the AI checked endpoints, bodies and error codes against `order-service/src/orders/*`, `supplier-service/src/locations/*` and the frontend. Still to do (me): review the doc.

### 2026-10-21 — Order Service explained, and an order lifecycle doc

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** new: `docs/orders/order-lifecycle.md`

**Scenario:** to understand the Order Service my teammates built, then turn its lifecycle into a team reference.

**Prompts (exact, in order):**
> Read the current order service implemntation and explain to me the following: 1) Brief description of what the order-service does 2) The lifecycle of an order including relevant states and possible transitions from state to state 3) Every endpoint, brief description of endpoint, relevant payload / queries / params

> For point 2, can you create a markdown under /docs/orders referencing a order lifecycle

**What it produced:** an explanation in chat; the doc, with a states table, a Mermaid diagram, the transitions, rules, proposals, expiry, credits and events.
**Who decided:** no design; the doc describes existing code.
**Verification:** the AI checked the doc against `orders.service.ts`, `confirmations.service.ts`, `orders.schemas.ts` and `001_init.sql`. Still to do (me): review it and preview the diagram.

### 2026-10-19 — `UserRegistered` through a transactional outbox

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate, verify
**Files:** `user-service/`: new outbox migration, `outbox.repository.ts`, `outbox.relay.ts`, `kafka.producer.ts`, `user-events.ts`, `AGENTS.md`, 3 specs; changed `auth.service.ts`, `users.service.ts`, `infra.module.ts`, `env.validation.ts`, `logger.ts`, `compose.yaml`, `package*.json`, the Postman collection, `ai/open_decisions.md`; root `.env.example`

**Scenario:** Credit consumes `UserRegistered`, but nothing published it (#54). I asked about Kafka first, then designed the outbox and relay myself, with the AI filling in details and finding gaps.

**Prompts (exact, in order):**
> Check the project for the following: 1) How is kafka being implemented currently? 2) What event does order service consume from the user service and how it does it?

> Sorry i meant credit <-> user events

> Can you explain the following to me: 1) How does kafka work? 2) If I were to implement kafka for the user service's side, what do i have to implement on the high level 3) How do retries work? How to handle event failure

> Yes, I am just asking you to explain concepts not make decisions

> was CDC used

> So outbox pattern isnt implemented yet? even for credit service?

> currently, what does credit service expect from user service?

> elaborate on the event payload it expects in terms of attributes

> what topic is it subscribed to

> Let's plan on the implementation of kafka UserRegistered event. I will implement a transactional outbox pattern. The verify() endpoint will publish to the users table and outbox table in a transaction. We have a background worker that polls the outbox table, it then publishes the corresponding event to kafka on the topic /user.events and the corresponding payload of type, userId, eventId just like credit service expects. 

> - What is lazy wallet creation? Is credit service ready for UserRegistered events? Can i confirm that logging service is currently wired? or no?

> *(pasted my design: verify() writes the user and the outbox row in one transaction; a lean
> outbox table; a setTimeout relay with SKIP LOCKED, stopping at the first failure; exponential
> backoff; idempotent producer; observability)* Clarify before proceeding. I basically want to move any failed attempts to a future logging service (you can inject comments in the relevant functions). The worker performs exponential backoff. Point out any potential mistakes / edge cases that i didn't account for until we reach common consensus.

> *(pasted my revised design: one sendBatch per tick, rollback on failure, reportRelayFailure,
> resetProducer, 10 s message timeout, no depends_on on Kafka, wait for the tick on shutdown)*
> this is my new plan. clarify that u understand and point out any gaps before proceeding

> Fix: catch errors from the whole tick, and schedule the next tick in a finally. I agree with this. Draft plan.

> *(plan approval)* Approved the plan but add two new tests to postman collection too: 1. /register and /get credits, on registration, user should have credits 2. check credits of bootsrapped admin

**What it produced:** the migration, `OutboxRepository` (`SKIP LOCKED`), `KafkaProducer`, `OutboxRelay` (backoff 1 s → 30 s, failure and stale logs), outbox writes in `verify()` and the bootstrap, the `user.events` contract in `AGENTS.md`, 14 tests, and 2 Postman credit checks.

**Who decided:**
- **Me:** outbox + polling, a lean table, payload `{type, eventId, userId, occurredAt}`, bootstrap admin publishes, no backfill, start with Kafka down, failures go to future logging, exponential backoff.
- **AI proposals I accepted:** no `depends_on` on Kafka, client timeouts, reset the producer after a failure, one batch per tick, a 60 s stale warning, wait for the tick on shutdown, always reschedule in `finally`.
- **AI proposals I rejected:** failure columns in the outbox table; a backfill in the migration.

**Verification:**
- Build, lint, and 14/14 tests pass (the PostgreSQL tests ran against the compose `user-db`).
- Full stack: register + verify published the event; Credit created a 10-credit wallet with the same `eventId`.
- Kafka down: register still worked and the row stayed pending. **Bug found:** a connect hung about 95 s. The AI cut it to about 6 s per tick. Backoff and the stale warning were then confirmed, and the row published once Kafka restarted.
- Not run yet: the bootstrap-admin path and newman (both need a fresh `user-db` volume).

### 2026-10-16 — Swap the refactored service in as `user-service/`

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, refactor
**Files:** folder renames (`user-service/` → `old-user-service/`, `refactored-user-service/` → `user-service/`); `compose.yaml`, `Dockerfile`, `API.md`, `package*.json`, Postman description, `ai/open_decisions.md`; outside the folder, approved first: root `compose.yaml` (disclosure line), `.github/workflows/ci.yml` (Node 24)

**Scenario:** carry out steps 1–6 of `ai/plan.md`.

**Prompts:**
> read refactored-user-service/ai/plan.md for context

> Execute the plan (steps 1 - 6). However, if you end up changing anything outside of the user service scope, inform me first. Clarify before proceeding

**Clarifications answered:** I approved the root and CI edits and a full stack restart, and asked for the leftover `foc-refactored_*` volumes to be removed.
**What it produced:** the renames and edits above, plus `test`/`engines` in `package.json`. Auto mode blocked two deletions (2 scaffold specs, old volumes), so I ran them myself.
**Verification:** CI simulated in `node:24-alpine` passes. The full stack came up (8 containers, bootstrap admin, health 200). newman direct: 0/349 failures. Via the gateway: 1 failure (logout without a token gets the gateway's 401 shape).

### 2026-10-16 — Password reset keeps the OTP until the password is saved

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate, debug
**Files:** `src/auth/auth.service.ts`, the Postman collection, `API.md`, `ai/open_decisions.md`

**Scenario:** compare how the password endpoints spend the OTP, then make `/auth/password/reset` keep the code on a "same as current" rejection, as `/users/me/password` does.

**Prompts:**
> I found these two facts:
> - /auth/password/vreset uses up the OTP code on invalid password formatting causing the user to request another OTP
> - If a user wants to change multiple fields at once, they will get OTP limited?
>
> true or no

> for point 1, what are you saying? i was referring to /auth/password/reset though

> - For /auth/password/reset. What happens on invalid pasword formatting and same password for otp consumtption
> - For /users/me/password. What happens on invalid pasword formatting and same password for otp consumtption
> - Can note the rate limiting thingy down under open_decisions

> Is it possible for /auth/password/reset to mimic the logic of /users/me/password which keeps the OTP code instead of consuming it immediately? Clarify before you proceed

> *(choice)* Wipe the test DB (down -v)

> just to double confirm, u already updated usage-log?

**What it produced:** fact 1 is false for bad formatting but true for the same password; fact 2 is true. It added open decision 10, a `resetPassword` that deletes the code only after a save, and a new Postman case.
**Who decided:** the AI flagged a security trade-off under the AI policy, and I chose to make the change. AI mistake: an extra OTP request during testing triggered a block, and testing showed the admin email had changed. I chose to wipe the test volumes.
**Verification:** build passes. After the wipe, newman: 135 requests, 0/349 failures. The new case returned 400, then 204 with the same code.

### 2026-10-16 — API reference and manual Postman guide

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, explain
**Files:** `API.md` (new)

**Prompts:**
> Can you write me an api reference markdown file for this refactored user service and tell me how to manually test my program via postman with the base_url and port?

**What it produced:** `API.md`, written from the code (base URL, auth, error codes, field rules, every endpoint), and a manual Postman walkthrough.
**What I changed or rejected:** —
**Verification:** pending my review.

### 2026-10-16 — Restructure plan, steps 4–7 (port, Docker, Postman, attribution)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, refactor, debug
**Files:** all of `src/` except `fields.ts` and `auth/dto/*`; `001_init.sql` (copied); `Dockerfile`, `.dockerignore`, `compose.yaml`; the Postman collection; `tsconfig.json`; `ai/plan.md`, `ai/open_decisions.md`

**Scenario:** port the old User Service into the agreed structure, then show that it builds, runs in Docker and passes Postman.

**Prompts:**
> - Yes i agree with your changes
> - Update usage-log.md, emove the date line entirely

> Continue with step 4 to step 7. Ensuring that npm run build, existing / new postman tests passes and containerized version of the refactored application runs. Let me know once step 7 is finished. Ensuring that nestjs file structure principles is followed.
>
> Clarify before proceeding.

**Clarifications answered:** I start Docker; newman via `npx`; new Postman tests check every field rule; the `plan.md` tree is enough.
**What it produced:** the port, with behaviour copied from the old service plus one planned change (`reactivate` re-checks ADMIN in the database); file headers that name the source file; 63 new Validation requests in Postman. Deviations: `node:24-alpine`, `incremental` removed from tsconfig, a temporary host port for testing. Logged as open decision 9: audit lines redact `code`.
**Verification:** build passes. On a fresh volume the service boots and `/health` returns ok. newman: 133 requests, 0/347 failures. No `ERROR` lines and no emails in the logs.

### 2026-10-16 — Restructure plan, steps 1–3 (open decisions, instructions, CommonJS setup)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, refactor
**Files:** `ai/open_decisions.md`, `ai/instructions.md`, `ai/plan.md`, `package*.json`, `tsconfig.json`, and every `src/` file with relative imports

**Prompts:**
> read refactored-user-service/ai/plan.md and understand the task at hand. Clarify with me that u understand before proceeding.

> Yes correct. Implement steps 1 to 3 first.

**What it produced:** 8 open decisions; `instructions.md` updated to the plan; a switch to CommonJS (`.js` suffixes stripped, `void bootstrap()`, a `migrate` script); the dependencies installed. Deviation: TS 6 rejects `moduleResolution: node`, so it uses `nodenext`.
**What I changed or rejected:** I approved the `nodenext` deviation.
**Verification:** build passes; `dist/main.js` is CommonJS; the app boots and maps `/auth`.

### 2026-10-15 — Session logs and file headers

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate
**Files:** `ai/usage-log.md`, `ai/sessions.md`, disclosure headers on the AI-written code files

**Prompts:**
> 1. Log the current session based on the AI policy under refactored-user-service/ai/usage-log.md
> 2. Log the current session and progress done under refactored-user-service/ai/sessions.md. Help me write a note stating that we should implement postman tests for field validation wise for all auth endpoints.
>
> Clarify before proceeding

**What it produced:** both logs and a 4-line disclosure header on each AI-touched file.
**Verification:** I read both logs and every header.


### 2026-09-28 — Step 13: admin reactivation (branch `feature/user-service-protected-endpoints`)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** explain, generate, verify
**Files:** `user-service/src/users/{users.repository,admin.service,admin.controller,admin.service.spec}.ts`, `user-service/AGENTS.md`, `README.md`, the Postman collection, `/ai/usage-log.md`

**Scenario:** `POST /admin/users/:userId/reactivate`, after reading the docs and planning first.

**Prompts (exact):**

> I am person b (Deanson), implementing user service. Read the AGENTS.md, README.md and other
> relevant files under /user-service folder to get a better understanding.

> What is step 14 and step 15 about respectively.

> Skip step 14 for now, edit AGENTS.md as a note, we probably only implement it once we have
> notification service up.

> Go ahead and implement step 13, including adding relevant tests to postman collections. After
> you are done, list the files you added / edited. DO NOT proceed to subsequent steps (step 15)
> without my permission

> u don't have to test it via docker compose. Let me do it instead. Are you done with this
> endpoint?

> Give me the steps to test this endpoint via Postman

> I tested the following via Postman.
> - Reactiviating an activated account, rejected (account must be deactive 409)
> - Rectivating using a user account, rejected must be admin role (403)
> - Reactivating a user that doesnt exist (404)
> - no access token -> 401 (the token is invalid or has expired)
> - happy path (deactivatied account became active again)
>
> Step 13 looks all good to me. Update the relevant files such as usage-log.md,
> user-service/AGENTs.md as well as other relevant files.

(One choice was made through a multiple-choice question; it is under "Who decided".)

**What it produced:** `reactivate` in the repository, service and route (404, 409, audit log), 3 tests, doc updates, and a Postman request.
**Who decided:** the AI gave 3 options for re-checking the caller's admin status. I chose to trust `RolesGuard` only, because reactivation can't break the last-admin rule. I deferred Step 14 until Notification exists.
**Verification:** build passes and tests pass 271/271. I tested it in Postman: 409, 403, 404, 401 and the happy path all matched the specs.

### 2026-09-28 — Step 12: the six OTP-protected self-service endpoints (branch `feature/user-service-self-profile`)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** explain, generate, debug, verify
**Files:** `user-service/src/{auth/auth.schemas,users/users.schemas,users/users.repository,users/users.service,users/users.controller,users/users.service.spec,otp/otp.scripts,otp/otp.service,otp/otp.service.int.spec}.ts`, `AGENTS.md`, `README.md`, the Postman collection

**Scenario:** OTP request, email change and verify, mobile, password, and deactivate. While reviewing when each code is spent, my literal request turned out to open a security hole, which was redesigned before any code was written.

**Prompts (exact):**

> I am person B (Deanson) implementing user service. Read /user-service AGENTS.md, readme.md and
> all relevant files under user-service.

> DOn't implement anything yet. Tell me your plan for step 12, let's ensure we are on the same
> page.

> 1. How are OTPs stored currently?
> 2. what do u mean by 'consume' in this context
> 3. new password must differ from current
> 4. I rather you just fold the modules in instead of name it self-service.controller etc,
> because it may be confusing.

> Go ahead and implement step 12 as accordingly to what we discucsed. After you are finished,
> state the files / functions you edited or changed for each endpoint. DO NOT start on step13
> without my permission.

> Run through the flow of a user wanting to change their email

> Run through the flow for account registration. I just want to compare the flow.

> I checked the corresponding files and code. It will looks okay. I will now proceed with
> testing via Postman.

> I don't think step 10's requests is in the collection?

> Add step 10 and step 12 to the collection

> under each /me/email or mobile or password, what currently happens when an expired otp is used

> flag step 12 with a note saying that 3 OTP requests limit per 10min may need to be
> reconsidered since user might change multiple fields consecutively in AGENTS.md

> For each data flow (email, mobile and password). Tell me when an OTP is consumed

> For /POST /users/me/email, we should only consume the code after we run our verification such
> as if the email is valid and that if the email is unique
> For /POST/users/me/password, we should only consume the code after we run our verification
> such as the new password passes the correct length and format as well as that it is different
> from the previous password
>
> Clarify that you understand.

> Continue

> how many times is correctness checked for in terms of limit?

> on password change, are all refresh tokens invalidated?

> I have tested step 12's all endpoints on postman, everything looks good. help me edit the
> corresponding files including usage-log.md, agents.md and other relevnt files to reflect this
> progress

(Two design points were settled through multiple-choice questions; they are under "Who decided".)

**What it produced:** the six endpoints and their schemas; repository methods (409 `EMAIL_TAKEN` on a unique violation); rewritten spec mocks and new tests; walkthroughs of the email-change and registration flows; a non-consuming `OtpService.check`/`checkRecord` (`CHECK_OTP_LUA`) and the redesigned `requestEmailChange`/`changePassword`.

**Who decided:**
- **Me:** the self-profile shape for mobile and email-verify; fold everything into the existing users files; "must differ from current" also applies to `changePassword`; don't spend the code when a business check fails; the OTP rate-limit note in AGENTS.md.
- **AI proposal I adopted:** "verify, then consume only on success". My literal reorder would have let a leaked token use `changePassword` to guess passwords with no limit. Applied to both endpoints.
- **AI finding:** Step 10's admin requests were never in the Postman collection, so I had both steps added.

**What I changed or rejected:** the literal form of my own OTP request, which was revised before any code was written.
**Verification:** build passes; unit tests 267/267; integration tests 50/50 against real Redis (including `check`/`discard`). I tested all six endpoints in Postman.

### 2026-09-28 — Step 11: GET /users/me, PATCH /users/me (branch `feature/user-service-admin-endpoints`)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** explain, generate, debug, verify
**Files:** `user-service/src/users/`: `profile.mapper.ts`, `profile.mapper.spec.ts` (new), `users.repository.ts`, `users.schemas.ts`, `users.controller.ts` (new), `users.service.ts` (new), `users.service.spec.ts` (new), `users.module.ts`; `AGENTS.md`, `README.md`, the Postman collection

**Prompts (exact):**

> I am person B implementing user service. I am Deanson. Under the user-service, read
> AGENTS.md, README.md and all relevant files.

> Let's discuss the plan together first before implementing anything.

> Remove GET/user/:userId, if needed, we can always add on query/params to GETadmin/users.

> Let's focus on discussing step 11 purely.

> Stop. Based on purely AGENTS.md, let's discuss step 11 which is to implement GET /users/me,
> PATCH /users/me.
>
> Under the GET endpoint, we can return all fields except the user's password, created_at /
> updated_at and deactiviated_at, status and role.
> Under the patch endpoint, no authentication is required, the user is only allowed to change
> their name under this endpoint.
>
> Ask me any clarifying questions.

> Do the following, edit the current AGENTS.md accordingly based on the discussed plan.

> Let's start on step 11. after finishing implementing the two endpoints. List the files /
> functions added for each endpoint. DO NOT go on to step 12 without my approval.

> so selfprofielresponse is for our public endpoint while toprofielresponse is reserved for
> admin ednpoints?

> Tell me the steps to test both endpoints on postman.

> Can I clarify that the the register endpoint pre-checked that a user's display name is
> unique?

> flag non-unique display_name under step 11 in agents.md just as a note

> I ran tests through Postman, step 11 looks good. Edit usage-log.md, agents.MD and other
> relevant files accordingly.

**What it produced:** `toSelfProfileResponse` (with `toProfileResponse` built on it), `updateDisplayName`, `UpdateSelfProfileSchema`, `UsersController`/`UsersService`, 2 spec files, doc updates, and 2 Postman requests.
**Who decided (me):** dropped `GET /users/:userId`; `PATCH /users/me` needs the JWT but no OTP (the AI pointed out my wording was ambiguous); a narrower self-profile shape, recorded in AGENTS.md; I found that `display_name` isn't unique and had it noted.
**What I changed or rejected:** no generated code; both design points were settled before any code was written.
**Verification:** build passes; tests 237/237. In Postman: GET returns only the 5 self fields; PATCH renames; an extra field gets 400; no token gets 401.

### 2026-09-27 to 2026-09-28 — Step 10 endpoint 2: PATCH /admin/users/:userId/role (branch `feature/user-service-admin-endpoints`)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** generate, explain, debug, verify
**Files:** `user-service/src/users/`: `admin-lock.service.ts` (new), `admin-lock.service.spec.ts` (new), `admin.service.spec.ts` (new), `admin.service.ts`, `admin.controller.ts`, `users.repository.ts`, `users.schemas.ts`, `users.module.ts`

**Prompts (exact):**

> Run though ur plan of implementing this endpoint

> Summarize endpoint 2 plan

> Explain the logic behind implementing this endpoint

> Explain AdminLockService

> Ask me any clarifying questions before proceeding

> Continue to implement step 10 endpoint 2. When you are done, do the following:
> - List the files you have edited

> when and where is AdminLockService ran?

> {{baseUrl}}/admin/users/82663fb1-e431-4750-9f38-c8b5585b9bd3/role
>
> is this not the correct endpoint?

> Give me the steps to test endpoint 2

> What's the steps to test endpoint 2 via postman

> just tell me verbally

> how to register Alex?

> I tested the endpoint via Postman. Update usage-log-md, AGENTS.md and other relevant files,
> marking step 10 as complete

(I also asked for explanations of `auth/decorators.ts` and `auth/jwt-auth.guard.ts`; nothing was changed.)

**What it produced:** `AdminLockService` (locks the caller row, then the active admins, in one transaction), the `changeRole` logic, repository methods, schema, route and wiring, and 2 spec files (also covering `listUsers`).
**What I changed or rejected:**
- Clarifying choices: `ParseUUIDPipe` (400), a real no-op on self-reaffirm (no write, no audit), and backfilling the `listUsers` tests.
- **I caught a bug its tests missed:** `LAST_ADMIN` could never fire, because self-targeting always returned `CANNOT_MODIFY_SELF` first, and the tests used a mock state that can't happen. I had the check moved into the self-demotion branch and the tests rewritten.

**Verification:** build passes; the new specs pass 17/17 (2 `jwt.service.spec.ts` failures already exist on the base branch). In Postman: promote, a no-op re-affirm, `CANNOT_MODIFY_SELF`, demote, `LAST_ADMIN`, 404, 400, 403 and 401 all passed.

### 2026-09-27 — Step 10 planning and GET /admin/users (branch `feature/user-service-admin-endpoints`)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** explain, generate
**Files:** `user-service/src/users/`: `users.schemas.ts`, `profile.mapper.ts`, `admin.service.ts`, `admin.controller.ts` (all new), `users.repository.ts`, `users.module.ts`

**Scenario:** my track (Steps 10–14) wasn't started. I used the AI to get oriented and plan Step 10, then to implement endpoint 1 only, so I could test it before endpoint 2.

**Prompts (exact):**

> Read agents.md and readme.md and get the sense of the current's project's progress

> I am person B, let's go through the plan together and what to implement and ensure we are on
> the same page. DO NOT start on phase 2 at all.

> Run me through the steps of how you plan to implement step 10. What endpoints, what you plan
> to do under each endpoint including payload and response. Afterwards, let me know how I shall
> test it.

> - All four filters (role, status, email) are optional; page/pageSize default to 1/20 if
> omitted. How did you figure this?

> Don't implement yet.
> - For GET /admin/users, only filter by role and status. no pagination needed as of now

> Go ahead and implement step 10 for me. Start with endpoint 1. Do not start with endpoint 2
> until i have finished verifying and testing endpoint 1.

> I am person B and implementing User service. Read AGENTS.md, README.md, sessions folder
> under the user-service folder as well as other relevant files under the user-service folder.
> After you get a better understanding, pause and wait for the next instruction from me.

> steps to test endpoint 1 for step 10

> Let me be the one testing it via Postman. Give me the instructions

> [pasted user-service container log line showing ADMIN_BOOTSTRAPPED] Can you confirm mail
> service is up. not getting an email

> I have verified endpoint 1, all is working well. Document it under usage-log.md and other
> relevant files.

**What it produced:** a plan for Steps 10–14; then `listUsers`, `toProfileResponse`, `AdminService` and `AdminController` (behind `@Roles('ADMIN')`); a Postman/curl test plan; and the explanation that OTP emails go to Mailpit (localhost:8025), not a real inbox.
**What I changed or rejected:** I rejected the AI's pagination and `email` filter: role/status filters only, `{ items }` response (a deliberate deviation from AGENTS.md). It confirmed it has no authority to commit for me.
**Verification:** build passes; tests 213/213. In Postman/curl: listing, filters, 400 for an unknown param or bad role, 403 and 401.
