<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Wrote up Deanson's screen requirements (Home, Orders, Order detail) as an integration plan, adding the current state of the code, the shared groundwork, the testing steps and the open items.
Author review: Pending: Deanson to review.
-->

# Order Service ↔ frontend integration plan

**Status:** implemented on `feat/frontend-order-integration`, 2026-10-22, pending Deanson's review and browser pass (§7.7). The screen requirements are Deanson's, including the proposal and state-transition flow on the order page (§4).

**Decided by Deanson:**
- The pickup and delivery dropdowns list **locations**, shown as "Name, Building", and send the location's id.
- The button says **"Create Order"**, following the terminology rule in root `AGENTS.md` §2. The Figma's "Errand" is a known inconsistency.
- Lists and the order page are polled every 10 s with **React Query**.
- The gateway route for `/orders/**` (checked with Jie Yang) and adding the user id to `/api/session/status` were approved on 2026-10-22.
- Status badges are colour-coded (Deanson, 2026-10-22): `AWAITING_CREDIT` gray, `PENDING` light blue, `ACCEPTED` / `PICKED_UP` / `IN_PROGRESS` / `ARRIVED` blue, `COMPLETED` green, `CANCELLED` red. The colours are stored as hex in `STATUS_COLORS` in `frontend/lib/orders.ts` and shown by `StatusBadge` on order cards and the detail page.
- Both Orders tabs are grouped into **Active**, **Completed** and **Cancelled**. The frontend fetches every page and groups the orders itself (Deanson, 2026-10-22; replaces the 2026-10-22 "hide finished orders" decision).
- After **Accept** on Home, the courier goes straight to `/orders/:id`. Available Orders cards on Home aren't clickable; they only offer Accept (Deanson).
- `AWAITING_CREDIT` orders are shown, with the status "Awaiting credit". The detail page shows no buttons or proposal box in that state (Deanson).

## 0. Current state

Checked in the code on 2026-10-22.

- **Home page.** [`frontend/app/home/page.tsx`](../../frontend/app/home/page.tsx) has placeholder order sections. The Requester/Courier toggle is page state only; nothing is sent to the backend.
- **"My Orders" link.** It's disabled in [`app-shell.tsx`](../../frontend/app/components/app-shell.tsx).
- **No Order proxy route.** The browser calls `app/api/session/*` routes. These forward to the gateway through [`lib/protected-gateway.ts`](../../frontend/lib/protected-gateway.ts), which handles cookies, token refresh and the same-origin check. [`app/api/session/supplier/[...path]/route.ts`](../../frontend/app/api/session/supplier/%5B...path%5D/route.ts) is the pattern to copy.
- **No gateway route for orders.** [`api-gateway/envoy/routes/`](../../api-gateway/envoy/routes) has only `10-user` and `20-supplier`.
- **React Query isn't installed.** `@tanstack/react-query` isn't in `frontend/package.json`.
- **No user id in the session.** `/api/session/status` returns the caller's role, not their user id.

## 1. Shared groundwork

### Order proxy route
Add `frontend/app/api/session/orders/[...path]/route.ts`, a copy of the Supplier route. It allows only the endpoints this plan uses:

| Method | Path |
|---|---|
| `GET` | `/orders/available`, `/orders/mine`, `/orders/assigned` (with the query string forwarded), `/orders/:id`, `/orders/:id/confirmations` |
| `POST` | `/orders`, `/orders/:id/accept`, `/orders/:id/cancel`, `/orders/:id/pick-up`, `/orders/:id/start-delivery`, `/orders/:id/arrive`, `/orders/:id/confirmations`, `/orders/:id/confirmations/:confirmationId/respond` |
| `PATCH` | `/orders/:id` |

`:id` and `:confirmationId` must be UUIDs. Any other path returns 404. In particular, the proxy never forwards `/internal/**`.

### Gateway route
Add `api-gateway/envoy/routes/30-order.routes.json` for `/orders/**` only, in the same format as `20-supplier`. It exposes the existing order-service endpoints and changes none of them.

**Approved** with Jie Yang (API Gateway owner), 2026-10-22.

### React Query
- Add `@tanstack/react-query` to `frontend/package.json`.
- Add a client `providers.tsx` with a `QueryClientProvider`, wrapped around the app in `app/layout.tsx`.
- In `frontend/lib/orders.ts`, put:
  - the `Order` and `Page<Order>` types;
  - typed fetchers for each endpoint;
  - the query keys: `['orders', 'available' | 'mine' | 'assigned', page]` and `['order', id]`.
- Lists and the order page use `refetchInterval: 10_000`.
- After a create, accept, edit or cancel succeeds, call `invalidateQueries` so the affected lists and order refetch straight away.

### Caller's id for "viewing as"
Extend `/api/session/status` to also return the token's `sub` claim (the user id). It already decodes the token to read `role`. This is a small change to the frontend's own session response.

**Approved** by Deanson, 2026-10-22.

### Errors
The order-service returns errors as `{ error: { code, message } }`. Show `message`, using the existing [`error-feedback.tsx`](../../frontend/app/components/error-feedback.tsx) and [`service-errors.ts`](../../frontend/lib/service-errors.ts) helpers.

| Code | What the UI does |
|---|---|
| `VERSION_CONFLICT`, `INVALID_STATE` | Refetch the order or list, then show the message. |
| `COURIER_BUSY`, `INSUFFICIENT_CREDITS`, `LOCATION_INACTIVE`, `PICKUP_CLOSED` | Show the message. |

## 2. Home page (`app/home/page.tsx`)

**Remove:**
- "My Active Orders" from requester mode;
- "My Accepted Delivery" from courier mode.

### Requester mode
A **"Create Order"** button at the top right, shown in requester mode only. It opens the Create Order modal, a new component such as `app/components/create-order-modal.tsx`:

| Field | Input | Sent in `POST /orders` as |
|---|---|---|
| Order description | Text, required, not blank. Placeholder: "Describe your order". | `orderDescription` |
| Pickup location | Dropdown of ACTIVE locations, shown as "Name, Building" | `pickupLocationId` |
| Delivery location | Dropdown of ACTIVE locations, shown as "Name, Building" | `deliveryLocationId` |
| Credit offer | Whole number, checked ≥ 1 on the frontend | `creditOffer` |
| Window from | Read-only: "Now" | not sent |
| Window to | Read-only: "+24 h" | not sent |

- Confirming calls `POST /orders`. Leaving out `windowStart` and `windowEnd` makes the backend use its defaults: now to 24 h later.
- **Dropdown data.** The home page's `LocationBrowser` only holds the filtered page it's showing (12 locations), so the modal can't reuse it. The modal fetches ACTIVE locations itself, with `GET /locations?pageSize=100` through the existing Supplier proxy and React Query. 21 locations are seeded, and Supplier sets no upper limit on `pageSize`.

### Courier mode: "Available Orders"
- Polls `GET /orders/available` every 10 s, paginated.
- Each order card shows:
  - the order description
  - the pickup name
  - the delivery name
  - the credit offer
  - an **Accept** button
- Accept calls `POST /orders/:id/accept` with `{ version }` from the card, then opens `/orders/:id`.
- The cards aren't clickable; Accept is the only action.
- The card is a shared component, `app/components/order-card.tsx`, reused on the Orders page.

### Deferred
- The window start/end logic (an editable window).
- Caching the polled endpoint on the backend.

## 3. Orders page (`app/orders/page.tsx`, new)

- Enable the "My Orders" link in `app-shell.tsx`.
- A Requester/Courier tab at the top right:

  | Tab | Polls every 10 s, paginated |
  |---|---|
  | Requester | `GET /orders/mine` |
  | Courier | `GET /orders/assigned` |

- **Three sections in each tab** (Deanson, 2026-10-22):
  - **Active:** always open, at the top, with a count. Includes `AWAITING_CREDIT`.
  - **Completed** and **Cancelled:** collapsible, closed by default, with counts in the headings. They stay open across the 10 s refreshes.
- **Fetching:** the API has no status filter, so `listAllOrders()` in `lib/orders.ts` fetches every page (`pageSize=100`, at most 10 pages) and `groupOrders()` splits the orders. Nothing is paginated in the UI.
  - A backend `status` filter would be an API change (an interface decision under the AI policy) and isn't needed for now.
- **Cards** reuse `order-card.tsx`, plus the order's status. Active cards open `/orders/:id`. Completed and cancelled cards **aren't clickable**, because the detail page sends finished orders back to `/home`.

### Requester tab, `PENDING` orders only
- **Pencil icon:** opens an edit modal that reuses the create modal's form. It calls `PATCH /orders/:id` with `version` and only the fields that changed: description, pickup or delivery. The credit offer is shown read-only, because the API doesn't allow changing it.
- **Red cross icon:** opens a confirmation modal, then calls `POST /orders/:id/cancel` with `{ version }`.

The requester list can also include orders in `AWAITING_CREDIT`, briefly, while credits are being reserved. They're shown with the status "Awaiting credit" (decided). Orders cancelled because their credits were never reserved are `CANCELLED`, so they appear under **Cancelled** like any other. The list data doesn't include the cancellation reason, so they can't be told apart (decided: show them).

### Deferred
Caching the polled endpoints on the backend, e.g. with Redis.

## 4. Order detail page (`app/orders/[id]/page.tsx`, new)

- Polls `GET /orders/:id` every 10 s.
- **Finished orders:** if the order's `status` is `CANCELLED` or `COMPLETED`, redirect to `/home` with `router.replace`. This covers both opening a finished order and a poll that finds the order finished while the page is open, e.g. after the expiry job, a mutual cancellation, or an approved completion.
  - Finished orders aren't listed on the Orders page (§3), so this mostly covers direct links and orders that finish while the page is open.
- **Top right:** "Viewing as Requester" or "Viewing as Courier", found by comparing the order's `requesterId` and `courierId` with the caller's id. Someone who is neither, viewing an order that's still available, sees no label.
- **Body:** two columns side by side, stacked on mobile.
  - **Left column:**
    - the order description;
    - the status, as a horizontal lifecycle line: `PENDING → ACCEPTED → PICKED_UP → IN_PROGRESS → ARRIVED → COMPLETED` (finished orders redirect instead, see above);
    - the pickup name;
    - the drop-off name;
    - the credit offer;
    - the window, from and to, in local time;
    - at the bottom: the proposal box and the action buttons (below).
  - **Right column:** a placeholder for real-time chat (later phase).

### Proposal box
- Polls `GET /orders/:id/confirmations` every 10 s, with query key `['confirmations', id]`.
- **Only polls when it's relevant:** the caller is a participant (anyone else gets a 403) and the order is past `PENDING` (proposals only exist from `ACCEPTED` on). In React Query: `enabled: isParticipant && status !== 'PENDING'`.
- Shows only the proposal whose `status` is `PENDING`. There's at most one.
- The text uses the proposal's `kind`: `CANCELLATION` → "cancel", `COMPLETION` → "complete". `TIMING_CHANGE` isn't handled for now (decision 8).

| Caller is | Box shows | Buttons |
|---|---|---|
| The proposer (`proposedBy` = caller's id) | **WAITING**: "You proposed to *cancel* the order. The *requester* needs to accept before anything changes." | none |
| The other participant | **NEEDS YOUR RESPONSE**: "The *courier* has proposed to *cancel* the order." | **Accept** / **Reject** |

- Accept and Reject call `POST /orders/:id/confirmations/:confirmationId/respond` with `{ "response": "ACCEPTED" }` or `{ "response": "REJECTED" }`.
- The response is the resolved confirmation, not the order. On success, invalidate `['order', id]` and `['confirmations', id]`.
- When an approved cancellation or completion makes the order `CANCELLED` or `COMPLETED`, the finished-order redirect above sends both users to `/home`. The responder is redirected straight away; the proposer within 10 s.

### Action buttons: viewing as courier
There are always two buttons at the bottom of the left column: **Action** and **Cancel**.

| Order status | Action button | Calls |
|---|---|---|
| `ACCEPTED` | Pick up | `POST /orders/:id/pick-up` with `{ version }` |
| `PICKED_UP` | Start delivery | `POST /orders/:id/start-delivery` with `{ version }` |
| `IN_PROGRESS` | Arrived | `POST /orders/:id/arrive` with `{ version }` |
| `ARRIVED` | Request Completion (disabled while a proposal is pending, see decision 1) | `POST /orders/:id/confirmations` with `{ "kind": "COMPLETION" }` |

- **Cancel** opens a confirmation modal, then creates a proposal: `POST /orders/:id/confirmations` with `{ "kind": "CANCELLATION" }`.
- Action stays enabled while a proposal is pending. The backend allows steps then, and the UI follows it (decision 3).
- `version` comes from the latest poll of `GET /orders/:id`. Each step returns the updated order; on success, set it into `['order', id]`.

### Action buttons: viewing as requester
- There's always a **Cancel** button, and it always opens a confirmation modal first.
  - **`PENDING`:** cancels directly with `POST /orders/:id/cancel` and `{ version }`, the same call as the Orders page's red cross (decision 6). The proposal box doesn't poll in `PENDING`.
  - **`ACCEPTED`, `PICKED_UP`, `IN_PROGRESS`, `ARRIVED`:** creates a proposal with `POST /orders/:id/confirmations` and `{ "kind": "CANCELLATION" }`.

### Deferred
- The window adjustment logic (`TIMING_CHANGE` proposals).
- Caching proposals on the backend, e.g. with Redis.
- Showing what happened to a rejected proposal. For now, a rejected proposal just disappears from the box (decision 2).
- Notifications outside the order page, e.g. a bell icon in the app shell. For now, "NEEDS YOUR RESPONSE" only shows on this page (decision 9).

### Design decisions (Deanson, 2026-10-22)

| # | Question | Decision |
|---|---|---|
| 1 | Send the completion proposal automatically? | No. In `ARRIVED`, the Action button becomes **Request Completion**, which the courier presses like the other steps. It is disabled while the polled confirmations include a `PENDING` proposal, or after the request gets 409. |
| 2 | Show rejected proposals? | No. The box just clears. Showing the outcome is deferred. |
| 3 | Block courier steps while a proposal is pending? | No. Pick up, Start delivery and Arrived stay enabled, as the backend allows, so the courier can carry on with the delivery while a proposal is pending. |
| 4 | Cancel while a proposal is pending? | (a): Cancel is disabled while any proposal is pending, with a hint (see the notes below). |
| 5 | Confirm before cancelling? | Yes. Every Cancel button opens a confirmation modal. |
| 6 | Cancel a `PENDING` order from the detail page? | Yes, directly with `POST /orders/:id/cancel`. Confirmations aren't polled in `PENDING`. |
| 7 | Window ending | ⚠ A serious gap, to address in a later phase (see the notes below). |
| 8 | Handle `TIMING_CHANGE` proposals? | Not for now. |
| 9 | Notifications outside this page? | No. Only this page shows them; a bell icon is deferred. |
| 10 | Wording | "Reject". The API value is `REJECTED`. |

### Notes behind decisions 1, 4 and 7

**1. Completion is a manual button.** `POST /orders/:id/confirmations` is **not idempotent**:
- While a proposal is pending, a second one gets 409 `CONFIRMATION_PENDING`.
- Once the requester **rejects** a completion, a new one is accepted. If the courier's page re-sends whenever it sees `ARRIVED` with nothing pending, the requester can never reject for good.
- Once approved, the order is `COMPLETED`, and further proposals get 409 `INVALID_STATE`.
- So the courier presses **Request Completion** instead of the page sending it. After a rejection, the courier can press it again.
- **Disabled while a proposal is pending** (Deanson, 2026-10-22). Request Completion is a proposal, so it would get 409 `CONFIRMATION_PENDING` then, e.g. during a requester's cancellation. Decision 3 still keeps the step buttons enabled.
  - Disabled when the polled `['confirmations', id]` list has an item with `status: "PENDING"`.
  - Also disabled after the request gets a 409. On the 409, invalidate `['order', id]` and `['confirmations', id]`, so the button's state follows the next fetch: it's enabled again once nothing is pending, e.g. after a rejection.

**4. Cancel while a proposal is pending.** An order can have only one pending proposal of any kind, and there's no endpoint to withdraw one. Any new proposal gets 409 `CONFIRMATION_PENDING`.

| Situation | Result of pressing Cancel |
|---|---|
| The other party already proposed a cancellation | 409. **Accept** in the box does the same thing. |
| You already proposed a cancellation | 409. Yours is already waiting. |
| `ARRIVED`, courier's completion pending, **requester** wants to cancel | 409. The requester must **Reject** the completion first. |
| `ARRIVED`, courier's own completion pending, **courier** wants to cancel | 409. The courier can't withdraw it, so they're stuck until the requester answers. |
| `ARRIVED`, a cancellation pending | The automatic completion gets 409. Repeated sends get repeated 409s. |

- **Decided: (a).** Cancel is disabled while any proposal is pending, with a hint:
  - for the proposer: "Waiting for a response to your proposal";
  - for the receiver: "Respond to the pending proposal first".
- A withdraw endpoint would need an API change, which is ⚠ an interface decision under the AI policy. It isn't planned.

**7. When the window ends. ⚠ A serious gap, to address in a later phase.** `window_end` defaults to 24 h after creation.

*From `window_end` until the expiry job runs (up to about 60 s), the status doesn't change yet:*

| Still allowed | Refused (409 `INVALID_STATE`) |
|---|---|
| Requester cancels a `PENDING` order | Accept. The order also drops out of `GET /orders/available` immediately. |
| Proposing, accepting or rejecting a cancellation | Editing a `PENDING` order |
| Everything on an `ARRIVED` order | Pick up, start delivery, arrive |
| | Timing-change proposals and approvals |

*When the expiry job runs (every 60 s):*
- `PENDING`, `ACCEPTED`, `PICKED_UP` and `IN_PROGRESS` orders become `CANCELLED`, with reason `EXPIRED` and no actor.
- A pending timing change becomes `EXPIRED`. A pending cancellation becomes `SUPERSEDED`.
- `OrderCancelled` is published, and the requester's credits are released within about 10 s.
- **`ARRIVED` never expires.** It stays until both parties agree to complete or cancel.
- The job checks each order again under a lock, so a step that commits just before `window_end` still wins.

*Frontend effect:*
- Within 10 s of the job, the order poll sees `CANCELLED`, and both users go to `/home`.
- Before that, Action returns 409.
- **Not handled in this phase.** For now, Action fails with 409 for up to about 60 s after the window ends, and the page shows the error message. A later phase should decide how the page handles an ended window, e.g. disabling Action and showing "The window has ended. This order will be cancelled shortly."
- A courier still in `IN_PROGRESS` at `window_end` loses the order, and the credits return to the requester. That's the backend's decided rule.

## 5. Testing

- **Build:** `npm run lint` and `npm run build` in `frontend/`.
- **Proxy route:** add cases to `frontend/test/routes.test.mjs`. The allowed paths pass; `/internal/...`, unknown paths and non-UUID ids return 404.
- **Manual run** on the full `docker compose up` stack, with two users, A and B:
  1. A creates an order. Within 10 s it appears in B's Available Orders.
  2. B accepts it. B then gets a 409 `COURIER_BUSY` when accepting a second order.
  3. A edits a `PENDING` order, then cancels one.
  4. The detail page shows the right "viewing as" label for each user.
  5. Opening a cancelled order, or having it cancelled while the detail page is open, sends the user to `/home` (within 10 s for the second case).
  6. In both Orders tabs, finished orders sit in the collapsed **Completed** and **Cancelled** sections, with correct counts, and those cards aren't links.
  7. As courier B: Pick up → Start delivery → Arrived, with the lifecycle line moving each time. At `ARRIVED`, B presses Request Completion. B sees WAITING, and Cancel is disabled with a hint; within 10 s, A sees NEEDS YOUR RESPONSE.
  8. A accepts: the order is `COMPLETED`, and both users end up on `/home`.
  9. On another order, A proposes a cancellation and B rejects it: the box disappears and the order is unchanged. Then B proposes one and A accepts: both users end up on `/home`. Every Cancel asks for confirmation first.
  - A opens one of their own `PENDING` orders and cancels it from the detail page. It's cancelled directly, and the network tab shows no `/confirmations` requests while the order was `PENDING`.
  10. Every page works at desktop and phone widths.

## 6. Open items

| Item | Owner / when |
|---|---|
| Editable timing window | Deferred |
| Backend caching (Redis) for polled endpoints | Deferred |
| Window adjustment (`TIMING_CHANGE` proposals) | Deferred |
| Backend caching (Redis) for proposals | Deferred |
| ⚠ Window ending (§4 note 7): courier steps fail before the expiry job runs; `IN_PROGRESS` orders are cancelled | Later phase (serious) |
| Showing rejected proposals | Deferred |
| Notification bell outside the order page | Deferred |
| Order history on the detail page | Not planned yet |
| Backend `status` filter for `/orders/mine` and `/orders/assigned` | Not needed for now: the frontend fetches every page. ⚠ It would be an API change under the AI policy. |

### Order-service endpoints and fields not used yet

These exist in the order-service, but this plan doesn't call them. All are deferred unless noted.

| Endpoint or field | What it does | Why not used |
|---|---|---|
| `GET /orders/:orderId/history` | Every change to the order, oldest first: actor, action, old and new status, details | Order history on the detail page isn't planned yet. |
| `POST /orders/:orderId/confirmations` with `{ "kind": "TIMING_CHANGE", windowStart, windowEnd }` | Proposes a new window once the order is accepted | Window adjustment is deferred (decision 8). |
| `windowStart` / `windowEnd` in `POST /orders` | Sets the window on create (default: now to +24 h) | The window is read-only for now; the backend defaults are used. |
| `windowStart` / `windowEnd` in `PATCH /orders/:orderId` | Changes the window of a `PENDING` order | Same: editable windows are deferred. |
| `GET /internal/orders/users/:userId/active` | Whether a user has unfinished orders, for the User Service's deactivation check | Not for the frontend. It's service-to-service (`X-Service-Key`); the gateway and the proxy never route `/internal/**`. |

## 7. Implementation steps

**Done, 2026-10-22.** These were the steps to build §1–§4 of this plan, including decisions 1–10.

Where the build differs from or adds to the steps below:
- The proxy is `app/api/session/orders/[[...path]]` (an optional catch-all), so `POST /api/session/orders` with no extra segment also matches.
- If the detail page gets a 400, 403 or 404 for the order, it sends the user to `/home?notice=order-unavailable`, and Home shows "That order doesn't exist or isn't available to you."
- After Create Order, Home shows "Order created" with a **View order** link.
- The session check used by the new pages is in `app/components/use-session.tsx`. Home keeps its own.
- On phones (≤ 639 px), `.home-heading` now stacks, which also affects Home's heading.

**Verification results (2026-10-22):**
- `npm run lint` and `npm run build`: pass.
- Route tests: 40/40 pass, including 3 new order tests. They were run with Chrome, because the suite launches Edge, which isn't installed on Deanson's machine; the committed test file still uses Edge.
- Gateway: route-loader tests 5/5 and Envoy integration tests 20/20 pass.
- Full stack through the gateway, with two Mailpit-verified accounts: 35 checks pass.
- Still to do: Deanson's two-browser UI pass and phone-width check.

Drafted 2026-10-22.

Settled before starting:
- **UI:** match the existing style. Use `globals.css` classes plus Tailwind utilities, as `location-browser.tsx` does, with no shadcn and no new UI dependency.
- **Branch:** create `feat/frontend-order-integration` from `feature/order-service-real-time`. This doc and the usage log come with it.
- **Delivery:** all at once, verified together at the end.
- **Testing split:** the AI runs lint, build, the route tests, the gateway config check, and the full flow over HTTP through the gateway with two Mailpit-verified test accounts. Deanson does the two-browser UI pass and the phone-width check.
- **Approved earlier:** the gateway route (Jie Yang); `sub` in `/api/session/status` (Deanson). No order-service API changes.

Before writing frontend code, read the relevant guides in `frontend/node_modules/next/dist/docs/`, as `frontend/AGENTS.md` requires (this Next.js 16 has breaking changes). In particular: route handlers with async `params`, and dynamic routes like `app/orders/[id]`.

### 7.1 Gateway: `api-gateway/`
- **New `envoy/routes/30-order.routes.json`**, in the same format as `20-supplier.routes.json`:
  - `service: "order"`, `urlEnv: "ORDER_SERVICE_URL"`, prefix `orders` (`GATEWAY_ORDERS_PREFIX`, default `/orders`).
  - Routes:
    - `GET` `{orders}/available`, `{orders}/mine`, `{orders}/assigned`, regex `{orders}/[^/]+`, regex `{orders}/[^/]+/confirmations`
    - `POST` `{orders}`, `{orders}/[^/]+/(accept|cancel|pick-up|start-delivery|arrive)` (one route each), `{orders}/[^/]+/confirmations`, `{orders}/[^/]+/confirmations/[^/]+/respond`
    - `PATCH` regex `{orders}/[^/]+`
  - The static `available`/`mine`/`assigned` routes go before the `[^/]+` regex. No `/internal/**`.
- **Wiring:**
  - `api-gateway/compose.yaml`: add `ORDER_SERVICE_URL: ${ORDER_SERVICE_URL:-http://order-service:3005}`, matching `SUPPLIER_SERVICE_URL`.
  - Root `.env.example`: add `ORDER_SERVICE_URL` (and `GATEWAY_ORDERS_PREFIX` if the supplier prefix is listed there).
- Check `api-gateway/test/` and `envoy/README.md` for route lists that need the new service, and update them.

### 7.2 Frontend groundwork: `frontend/`
- **`package.json`:** add `@tanstack/react-query` (v5).
- **`app/providers.tsx`** (new, client): a `QueryClientProvider` with one `QueryClient`, wrapped around `children` in `app/layout.tsx`.
- **`app/api/session/orders/[...path]/route.ts`** (new): copy `app/api/session/supplier/[...path]/route.ts`.
  - An `orderPath(method, segments)` allowlist matching doc §1. `:id` and `:confirmationId` must be UUIDs.
  - Forward the query string on the three list routes, and the JSON body on `POST`/`PATCH`.
  - Use `protectedGateway(..., true)`, and the same-origin check on anything but `GET`.
- **`app/api/session/status/route.ts`:** also return `userId` from the token's `sub`.
- **`lib/session-client.ts`:** add `userId?: string` to `SessionState` and parse it.
- **`lib/orders.ts`** (new): the order data layer.
  - Types: `Order`, `Page<T>`, `Confirmation`, matching `order-service/src/orders/orders.schemas.ts`.
  - Fetchers through `/api/session/orders/...`, using `sessionFetch` / `withSessionMutation`. Errors are thrown via the existing `parseServiceError` (`lib/service-errors.ts`), which already reads `{ error: { code, message } }`.
  - Query keys: `['orders', list, page]`, `['order', id]`, `['confirmations', id]`.
  - `isActive(order)`, plus a `POLL_MS = 10_000` constant.
  - Mutation helpers: create, edit, accept, cancel, step (`pick-up` | `start-delivery` | `arrive`), propose (`CANCELLATION` | `COMPLETION`), respond.
- **`lib/locations.ts`:** reuse it if it already has a fetcher for `GET /locations`; otherwise add `activeLocations()` (`pageSize=100`).
- **Shared components** (new, in `app/components/`):
  - `modal.tsx`: a small accessible dialog (`role="dialog"`, `aria-modal`, closes on Esc, keeps focus inside). Used for the create/edit form and the confirmations.
  - `confirm-modal.tsx`: "Are you sure?" with Confirm/Back.
  - `order-form-modal.tsx`: create and edit.
    - Fields: description, pickup and delivery `<select>`s ("Name, Building"), credit offer (integer ≥ 1; read-only in edit).
    - Window from/to are read-only ("Now" / "+24 h" when creating; the order's own values when editing).
    - Edit sends `version` plus only the changed fields. Field errors are shown with `FieldError` and `mapFieldErrors`.
  - `order-card.tsx`: description, pickup → delivery, credit offer, optional status and an optional actions slot. Links to `/orders/:id` when clickable.
  - `pager.tsx`, if `location-browser.tsx`'s pager isn't already reusable. Check first and reuse if it is.
- **Errors:** toasts via `useErrorFeedback` / `ErrorToast`. On a 409 (`VERSION_CONFLICT` or `INVALID_STATE`), invalidate the affected queries.

### 7.3 Home page: `app/home/page.tsx`
- Remove the two placeholder sections.
- **Requester mode:**
  - A "Create Order" button at the top right of the heading row, opening `order-form-modal`.
  - On success, close the modal, invalidate `['orders']`, and show a success message.
  - `LocationBrowser` stays.
- **Courier mode:**
  - "Available Orders": `useQuery(['orders','available',page], refetchInterval: POLL_MS)`, rendered as non-clickable `order-card`s with an **Accept** button. Accept calls `accept(id, version)`, invalidates `['orders']`, sets the returned order into `['order', id]`, and then opens `/orders/:id`.
  - Show a pager and an empty state.

### 7.4 Orders page: `app/orders/page.tsx` (new)
- Enable the "My Orders" link in `app-shell.tsx`, with `section="orders"`.
- **Requester/Courier tabs** at the top right (same `mode-switch` style as Home):
  - **Requester:** `['orders','mine',page]`.
  - **Courier:** `['orders','assigned',page]`.
  - Both poll every 10 s. *(Replaced on 2026-10-22: each tab now fetches every page and shows Active / Completed / Cancelled sections; see §3.)*
- **Requester tab, `PENDING` cards:**
  - pencil → edit modal;
  - red cross → `confirm-modal`, then `cancel(id, version)`.
- Cards link to `/orders/:id`.

### 7.5 Order detail page: `app/orders/[id]/page.tsx` (new)
- **Order query:** `['order', id]`, every 10 s. On `CANCELLED` or `COMPLETED`, `router.replace('/home')`. A 404 also goes back to `/home`, with a message.
- **"Viewing as Requester / Courier"** at the top right, using `session.userId` against `requesterId` / `courierId`. A non-participant sees no label.
- **Two columns** (`grid md:grid-cols-2`, stacked on mobile).
  - **Left:**
    - description;
    - the lifecycle line (`PENDING → … → COMPLETED`, current step highlighted);
    - pickup and drop-off;
    - credit offer;
    - window in local time;
    - then the proposal box and the buttons.
  - **Right:** a chat placeholder.
- **Confirmations query:** `['confirmations', id]`, every 10 s, `enabled: isParticipant && status !== 'PENDING'`. Use only the item with `status === 'PENDING'`.
  - **Proposer:** WAITING text.
  - **Receiver:** NEEDS YOUR RESPONSE text, with **Accept / Reject**, calling `respond`. Then invalidate both queries.
- **Courier buttons:**
  - **Action** by status: Pick up / Start delivery / Arrived (always enabled, decision 3). In `ARRIVED` it becomes **Request Completion**, which proposes `COMPLETION`. It's disabled while a pending proposal exists, or after a 409 until the refetch.
  - **Cancel:** `confirm-modal`, then propose `CANCELLATION`. Disabled while a proposal is pending, with a hint (decision 4a).
- **Requester buttons:** **Cancel**, always shown with `confirm-modal`.
  - In `PENDING`: `cancel(id, version)`.
  - Otherwise: propose `CANCELLATION`, disabled with a hint while a proposal is pending.

### 7.6 Attribution (root `AGENTS.md`)
- Every new or changed file gets an AI Assistance Disclosure header, appended to existing headers, plus `// AI-generated (pending review by Deanson)` markers.
- Add a new implementation entry to `ai/usage-log/deanson.md` with the exact prompts.
- Update this doc's status line to "Implemented on `feat/frontend-order-integration`", listing anything left out.

### 7.7 Verification
1. `cd frontend && npm install && npm run lint && npm run build`.
2. `npm run test:routes`. Add cases to `test/routes.test.mjs` with mocked order-gateway responses, as the existing Supplier tests do:
   - the proxy allowlist: allowed paths forwarded; `/internal/...`, unknown paths and non-UUID ids return 404;
   - the status route returning `userId`.
3. The gateway's own tests in `api-gateway/test/`, if present, plus a rendered-config check (`render.py`) with the new route file.
4. Full stack: `docker compose up --build`. Run the doc §5 manual steps with two users in two browsers: create, available within 10 s, accept, `COURIER_BUSY`, edit and cancel `PENDING`, the courier steps, Request Completion → accept → both on `/home`, cancellation proposal reject and accept, the disabled states, and phone width.
5. Report results faithfully, including any step I couldn't run (e.g. if `.env` lacks `CREDIT_SERVICE_KEY` / `ORDER_SERVICE_KEY`).

No commits unless Deanson asks.

## References
- [Order lifecycle](order-lifecycle.md)
- [`order-service/src/orders/orders.schemas.ts`](../../order-service/src/orders/orders.schemas.ts): request bodies and the `Order` type
- [`order-service/src/orders/orders.controller.ts`](../../order-service/src/orders/orders.controller.ts): routes
- [`supplier-service/AGENTS.md`](../../supplier-service/AGENTS.md): the `GET /locations` contract
