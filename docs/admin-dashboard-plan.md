<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
Scope: Wrote this plan from the N2H slide, the mockup (admin-dashboard-mockup.html) and a planning chat,
       then revised it the same day from the owner's answers (overview page, recording scope,
       USER_ALREADY_ACTIVE, schema in 001_init.sql, WRONG_PASSWORD, reactivation email, owners,
       P5/P7/P8/P10/P11 confirmed, awaited login recording, suspension email, Notification owner).
       The use cases and the items marked "Decided" are the dashboard owner's choices; items marked
       [Proposed] are Claude's suggestions and still need confirming.
Author review: Reviewed by Zi Yi, 2026-11-05.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added PATCH users/:uuid/role to the §8.1 proxy allowlist, recorded Zi Yi's decision, and added Admins to the §8.2 navigation.
Author review: Pending review by Zi Yi.
-->

# Admin Dashboard: implementation plan (N2H)

_Origin: Team (use cases and Decided items, planning chat 2026-11-02); AI doc (implementation detail, [Proposed] items)_

- **Owner:** Zi Yi (root `AGENTS.md` §3 Ownership).
- **Goal:** one place for admins to watch orders, spot accounts with many failed logins, and suspend or reactivate accounts after reviewing the evidence.
- **Status:** plan, waiting for approval (root `AGENTS.md`, "How to work: plan first"). Approvals needed: §11.
- **Legend:** **Decided** = agreed in planning · **[Proposed]** = suggested by Claude, confirm before building.
- **Shape:** not a new service. It is new `/admin/*` pages in `frontend/` plus new admin endpoints in the User and Order services, which own the data, routed through the gateway.

## 1. Use cases

### UC1: View live and past orders
1. The admin opens **Orders** and picks **Live** (`PENDING`, `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS`, `ARRIVED`) or **Past** (`COMPLETED`, `CANCELLED`).
2. Optionally filters by one state, or by a user (typed name or email).
3. Clicks an order. A side panel shows pickup, drop-off, description, credit offer, timing window and the **timeline**: every history entry with its time, plus the reason for a cancellation.
4. The requester and courier names link to UC5.

The Live view refreshes every 15 s.

### UC2: Failed-login watchlist
The admin opens **Logins** and sees:
- the number of failed logins in the last 24 hours;
- every user with **more than 10** failed logins in the last 24 hours, most failures first, with their status and last failure time. Each name links to UC5.

A **failed login** is a wrong password on an existing account. A correct password refused because the account is suspended or deactivated is **not** a failure. Attempts on unknown emails, and attempts while the account is already locked, are not recorded (D9).

### UC3: Suspend and reactivate an account
1. On a user's page (UC5), the admin clicks **Suspend…** on an `ACTIVE` account (never their own) and enters a **required reason**.
2. The dialog warns before confirming:
   - the user is logged out and can't log in;
   - their unfinished orders are cancelled now and are not restored by reactivation;
   - their current access token can still work for up to 15 minutes (known limit, `order-service/AGENTS.md`).
   - On confirm, the user is emailed that their account has been suspended (§6).
3. Once the issue is resolved, the admin clicks **Reactivate…**. The same button reactivates a `SUSPENDED` or a `DEACTIVATED` account.
   - Reactivation clears the suspension reason.
   - The user is emailed that their account is active again (§6).

### UC4: Suspended and deactivated accounts
The admin opens **Users** and switches between:
- **Suspended:** name, email, suspended since, reason;
- **Deactivated:** name, email, deactivated since.

Each row links to UC5, where the account can be reactivated.

### UC5: Investigate one user
One page per user shows:
- a header with name, role and status; when suspended, the reason and since when;
- the **Suspend…** or **Reactivate…** button (UC3);
- **Orders** tab: every order where they are requester or courier, in any state. It opens the same panel as UC1.
- **Login history** tab: each recorded attempt with its time and outcome, newest first.

Couriers are USERs in courier mode (root `AGENTS.md` §5), so "user and courier login logs" are one log.

### UC6: Overview
The admin dashboard's landing page, refreshed every 15 s:

| Item | Shows | Links to |
|---|---|---|
| Live orders | Total, plus a count per live state | UC1 Live |
| Locked accounts | Accounts locked right now (5 wrong passwords in 15 min locks an account for 15 min) | UC2 |
| Suspended accounts | Count | UC4 Suspended |
| Recent failed logins | Last hour, newest first: time, user, outcome | UC5 |
| Recent cancellations | Last hour, newest first: order, requester → courier, cancelled at | UC1 order panel |

## 2. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Use cases UC1–UC6 | Decided |
| D2 | No separate "failed orders" feature. Cancelled orders are in Past, and the reason shows in the timeline. | Decided |
| D3 | Lift a suspension with the existing `POST /admin/users/:userId/reactivate`, widened to accept `SUSPENDED` | Decided |
| D4 | Add `suspension_reason` and `suspended_at` to `users` in the **User Service**. Only the current suspension is kept. | Decided |
| D5 | The login audit log is a `login_events` table in the User Service | Decided (slide) |
| D6 | Failed login = wrong password on an existing account (`WRONG_PASSWORD` or `LOCKED`); flag at **> 10 in a rolling 24 h** | Decided |
| D7 | Admins can reactivate deactivated accounts from the dashboard | Decided |
| D8 | Left out: IP and device, credits on the user page, the ⚠ cancels-after-accept count, the dead-letters card | Decided |
| D9 | Attempts on unknown emails, and attempts while the account is already locked, are not recorded | Decided |
| D10 | Reactivating an `ACTIVE` account returns 409 `USER_ALREADY_ACTIVE`, replacing `NOT_DEACTIVATED` | Decided |
| D11 | Schema changes go into `user-service/db/migrations/001_init.sql`, not a new migration; the app starts from an empty database (§4.1) | Decided |
| D12 | Overview page (UC6) | Decided |
| D13 | Endpoint paths and response shapes in §4–§5; the failed-login outcome is named `WRONG_PASSWORD` | Decided |
| D14 | Admin order lists never show `AWAITING_CREDIT` | Decided |
| D15 | "Locked now" = distinct accounts whose lock started less than 15 min ago (§4.4) | Decided |
| D16 | Suspension and reactivation (from suspended or deactivated) email the user through the Notification Service (§4.3, §6) | Decided |
| D17 | Frontend uses the existing stack (§8). The mockup guides what to show, not how it looks. | Decided |
| P5 | Reason: 1–500 characters, trimmed | Decided |
| P7 | No retention or purge for `login_events` for now | Decided |
| P8 | Login events are written with `await`; a failed write fails the login. Accepts a small timing difference between an unknown email and a wrong password (§4.2). | Decided; confirmed by Zi Yi (User Service owner), 2026-11-05 |
| P10 | The two Overview lists show at most 50 rows each | Decided |
| P11 | Event `UserReactivated` on `user.events` (§4.3) | Decided |

**Why D4 and D5 are in the User Service, not Centralized Logging:** the reason and time describe the account's current state and must commit in the same transaction as `status` (root `AGENTS.md` §8). The logging service describes itself as "observability, not the audit trail of record" (`logging-service/AGENTS.md`, unmerged branch).

## 3. Out of scope

| Skipped | Add when |
|---|---|
| IP and device on login events | Cross-account IP patterns matter. Needs the Next.js login route to forward `X-Forwarded-For` and `User-Agent`, and they can be spoofed. |
| Attempts on unknown emails and while locked | Detecting password guessing across many emails matters |
| Equal login timing for unknown emails and wrong passwords | Email enumeration becomes a concern. Record unknown emails too, or write the row without awaiting. |
| History of past suspensions | Repeat offenders need tracking (an `account_actions` table) |
| Cancel-reason column and filter on order lists | Admins triage cancellations in bulk |
| ⚠ cancels-after-accept, dead-letters card, credits on the user page | Asked for |
| Purge of old `login_events` rows | The table gets large, or a retention period is required |

## 4. User Service

### 4.1 Schema: edit `db/migrations/001_init.sql` (D11)

Add two columns at the end of `CREATE TABLE users`:

```sql
    deactivated_at    TIMESTAMPTZ,                               -- cleared on reactivation
    suspension_reason TEXT,                                      -- set by suspend, cleared on reactivation
    suspended_at      TIMESTAMPTZ                                -- same
);
```

Add after `refresh_tokens`:

```sql
CREATE TYPE login_outcome AS ENUM ('SUCCESS', 'WRONG_PASSWORD', 'LOCKED', 'SUSPENDED', 'DEACTIVATED');

CREATE TABLE login_events (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID          NOT NULL REFERENCES users(id),
    outcome     login_outcome NOT NULL,
    occurred_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_events_time      ON login_events (occurred_at);
CREATE INDEX idx_login_events_user_time ON login_events (user_id, occurred_at);
```

- **Reset needed.** The migrator tracks applied files by name only, so a database that already ran `001_init.sql` skips the edit. Everyone deletes their local user-db volume once (or `docker compose down -v` to reset everything). Any deployed environment needs the same reset.
- Add a disclosure entry to the file's header, and update the Schema section of `user-service/AGENTS.md` (the file asks to be kept in sync with it).

### 4.2 Recording logins in `AuthService.login` (`src/auth/auth.service.ts`)

| Step in `login()` | Recorded |
|---|---|
| 1. Address already locked | nothing (D9) |
| 3. Unknown email | nothing (D9) |
| 3. Wrong password | `WRONG_PASSWORD` |
| 3. Wrong password that triggers the lock (`failure.locked`) | `LOCKED` |
| 4. Correct password, `DEACTIVATED` | `DEACTIVATED` |
| 4. Correct password, `SUSPENDED` | `SUSPENDED` |
| Tokens issued | `SUCCESS` |

Responses don't change.

New `LoginEventsRepository` in `src/users/`, exported from `UsersModule`:

```sql
INSERT INTO login_events (user_id, outcome) VALUES ($1, $2)
```

**Awaited (P8):** `await this.loginEvents.record(user.id, outcome)` before each return or throw.
- If the write fails, the login fails like any other database error, so the audit log has no silent gaps.
- **Known trade-off, accepted:** only a wrong password writes a row (D9), so it answers a few milliseconds slower than an unknown email. With enough attempts, someone could tell which emails have accounts.
- `login()`'s step comments call equal timing "the security property" (U2.1.2, U2.1.3, U2.3.1). Update them to say an audit write now makes the two cases differ slightly, and get the User Service owners' confirmation.

### 4.3 Suspend and reactivate (`src/users/`)

**Suspend** gets a body. New `dto/suspend-user.dto.ts`:

```ts
export const SuspendUserSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
```

`UsersRepository.suspend(userId, reason, tx)` sets `status = 'SUSPENDED', suspension_reason = $2, suspended_at = now()`. Everything else stays as it is: admin lock, session revoke, `UserSuspended` outbox row.

**Reactivate** moves into `withAdminLock`, like suspend, so the status change and its event commit together:
1. Refuse only when `target.status === ACTIVE`, with 409 `USER_ALREADY_ACTIVE` ("This account is already active."). Remove `NOT_DEACTIVATED` from `error-codes.ts`.
2. `UsersRepository.reactivate(userId, tx)` sets `ACTIVE` and clears `deactivated_at`, `suspension_reason` and `suspended_at`.
3. In the same transaction, `outbox.add(userReactivated(target.id, target.status), tx)`. Add a builder next to `userSuspended` in `src/users/user-events.ts`.
4. The audit line's `from` becomes the target's actual status.

**Event `UserReactivated` (P11)** goes on the same topic, key and delivery as `UserSuspended` (`user-service/AGENTS.md`, Events):

```json
{ "type": "UserReactivated", "eventId": "<uuid>", "userId": "<uuid>", "occurredAt": "<ISO 8601>", "previousStatus": "SUSPENDED" }
```

- `previousStatus` is `SUSPENDED` or `DEACTIVATED`, so Notification can say "reinstated" or "reactivated".
- No personal data (NFR5.1).
- Existing consumers skip unknown types: Order skips "other event types", and Credit's `parseUserEvent` returns null for them. Neither changes.
- **The suspension email needs no User Service change:** `UserSuspended` is already published on suspend. Add Notification as its second consumer in `user-service/AGENTS.md` and `API.md`.
- **Claim order** (`user-service/AGENTS.md`, "Before adding another event type"): a `UserReactivated` can follow a `UserSuspended` for the same user. Both run under `withAdminLock`, so they don't run at the same time. Two admins acting on one user at the same instant could still have the outbox claim them out of order. The only effect would be the "reinstated" email arriving before the "suspended" one. Record this in that section.

**Other rules:**
- **The reason is never written to log lines,** because free text can hold personal data (root `AGENTS.md` §8).
- **Breaking changes:**
  - suspend without a body is now 400;
  - the error code rename.

  Update `API.md` and **both** Postman collections (`user-service/postman`, `api-gateway/postman`), which assert `NOT_DEACTIVATED`.

### 4.4 Endpoints (D13)

All of these are in `UsersAdminController`, whose class-level `@Roles(Role.ADMIN)` already returns 403 to a USER.

| Method | Path | Change |
|---|---|---|
| GET | `/admin/users?status=` | Existing. `AdminProfile` gains `suspensionReason`, `suspendedAt`, `deactivatedAt` (null when unset). Serves UC4, the UC5 header, the UC6 suspended count and name lookups. |
| POST | `/admin/users/:userId/suspend` | Body `{ "reason": "…" }` (§4.3) |
| POST | `/admin/users/:userId/reactivate` | Also accepts `SUSPENDED`; 409 `USER_ALREADY_ACTIVE`; publishes `UserReactivated` (§4.3) |
| GET | `/admin/users/login-summary` | **New**, UC2 and UC6 |
| GET | `/admin/users/:userId/login-events?page=&pageSize=` | **New**, UC5. Page 1+, size 1–100 (default 20), same as Order's `PageQuery`. 404 for an unknown user. |

`GET /admin/users/login-summary`:

```json
{
  "failedLast24h": 37,
  "lockedNow": 1,
  "flagged": [
    { "userId": "uuid", "displayName": "Bob Lee", "status": "ACTIVE", "failedCount": 14, "lastFailedAt": "…" }
  ],
  "recentFailures": [
    { "userId": "uuid", "displayName": "Bob Lee", "outcome": "WRONG_PASSWORD", "occurredAt": "…" }
  ]
}
```

```sql
-- failedLast24h, lockedNow ($1 = LOGIN_LIMIT.blockSeconds, 900)
SELECT count(*) FILTER (WHERE outcome IN ('WRONG_PASSWORD', 'LOCKED')) AS failed_last_24h,
       count(DISTINCT user_id) FILTER (WHERE outcome = 'LOCKED'
                                         AND occurred_at > now() - make_interval(secs => $1)) AS locked_now
FROM login_events
WHERE occurred_at > now() - interval '24 hours';

-- flagged
SELECT e.user_id, u.display_name, u.status, count(*) AS failed_count, max(e.occurred_at) AS last_failed_at
FROM login_events e JOIN users u ON u.id = e.user_id
WHERE e.outcome IN ('WRONG_PASSWORD', 'LOCKED') AND e.occurred_at > now() - interval '24 hours'
GROUP BY e.user_id, u.display_name, u.status
HAVING count(*) > 10
ORDER BY failed_count DESC, last_failed_at DESC;

-- recentFailures
SELECT e.user_id, u.display_name, e.outcome, e.occurred_at
FROM login_events e JOIN users u ON u.id = e.user_id
WHERE e.outcome IN ('WRONG_PASSWORD', 'LOCKED') AND e.occurred_at > now() - interval '1 hour'
ORDER BY e.occurred_at DESC
LIMIT 50;  -- P10
```

- The 24 h and 1 h windows, the threshold of 10 and the row cap are constants in code, not settings. The lock duration reuses `LOGIN_LIMIT` from `redis.constants.ts`.
- `lockedNow` (D15) can over-count: a password reset lifts a lock early, but the account still counts until its 15 minutes pass. `ponytail:` to make it exact, check `loginlock:<emailHash>` in Redis for each candidate.

`GET /admin/users/:userId/login-events` returns `{ "items": [{ "outcome": "WRONG_PASSWORD", "occurredAt": "…" }], "page", "pageSize", "total" }`, newest first.

### 4.5 Files

- New: `src/users/login-events.repository.ts`, `src/users/dto/suspend-user.dto.ts`, `src/users/dto/page-query.dto.ts`.
- Changed:
  - `db/migrations/001_init.sql`
  - `src/auth/auth.service.ts`
  - `src/users/users-admin.controller.ts`
  - `src/users/users.service.ts`
  - `src/users/users.repository.ts` (columns, `suspend`, `reactivate`)
  - `src/users/user-events.ts`
  - `src/users/users.module.ts`
  - `src/common/errors/error-codes.ts`
  - `API.md`, `AGENTS.md` (schema, the Events section)
  - both Postman collections

## 5. Order Service

New `src/orders/admin.controller.ts`, `@Controller('admin/orders')`, with the static `overview` route declared first. Each handler first checks `caller.role === 'ADMIN'` and otherwise returns 403, logged like every other denial. A token's role can be up to 15 minutes stale; that's acceptable because these routes are read-only.

| Method | Path | Returns | Use case |
|---|---|---|---|
| GET | `/admin/orders/overview` | `{ live: { total, byState }, recentCancellations: Order[] }` | UC6 |
| GET | `/admin/orders?scope=&state=&userId=&page=&pageSize=` | `{ items: Order[], page, pageSize, total }`, the same `Order` shape as `/orders/mine`, newest first | UC1, UC5 |
| GET | `/admin/orders/:orderId/history` | `{ items: HistoryEntry[] }`, the same shape as `/orders/:orderId/history`; 404 if there is no such order | UC1, UC5, UC6 |

**Overview:**

```sql
SELECT status, count(*) FROM orders
WHERE status IN ('PENDING', 'ACCEPTED', 'PICKED_UP', 'IN_PROGRESS', 'ARRIVED')
GROUP BY status;

SELECT * FROM orders
WHERE status = 'CANCELLED' AND updated_at > now() - interval '1 hour'
ORDER BY updated_at DESC, id
LIMIT 50;  -- P10
```

- `updated_at` of a `CANCELLED` order is when it was cancelled: nothing changes an order after a terminal state (`markCreditSettled` sets only `credit_settled_at`).
- The list includes creates cancelled because credit couldn't be reserved; their timeline says `CREDIT_NOT_RESERVED`.
- `byState` lists all five live states, zeros included.

**List:**
- `AdminOrdersQuery` (Zod, strict) in `orders.schemas.ts`:
  - `scope`: `live` | `past` | omitted, where omitted means both (used by UC5);
  - `state`: one order state, which must belong to the scope (otherwise 400);
  - `userId`: UUID, matching `requester_id` **or** `courier_id`;
  - `page` and `pageSize`, as in `PageQuery`.
- Live = `PENDING, ACCEPTED, PICKED_UP, IN_PROGRESS, ARRIVED`. Past = `COMPLETED, CANCELLED`. `AWAITING_CREDIT` is never listed (D14).
- `OrdersRepository.adminList({ statuses, userId }, page)`: `WHERE status = ANY($1) [AND ($2 IN (requester_id, courier_id))] ORDER BY created_at DESC, id`, plus a count. Only bound parameters, nothing built from input. The existing indexes are enough.

**History:**
- Reuses `OrdersRepository.findById` (for the 404) and `OrdersRepository.history`.
- Each entry already carries `changeDetails`, a JSON column. Every cancellation writes `reason` into it:
  - `orders.service.ts`: `EXPIRED`, `USER_SUSPENDED`, `REQUESTER_CANCELLED`, `CREDIT_NOT_RESERVED`;
  - `confirmations.service.ts`: `MUTUAL_CANCELLATION`.
- The participant-only `GET /orders/:orderId` and `/history` stay unchanged.

**Files:** new `src/orders/admin.controller.ts`. Changed: `orders.schemas.ts`, `orders.repository.ts`, `app.module.ts` (register the controller), README, Postman collection.

## 6. Notification Service: suspension and reactivation emails (D16)

This work belongs to the Notification owner (Jie Yang) and builds on the open Notification issues. **The Notification Service needs both event types:**

| Event on `user.events` | Published by | Email to the user |
|---|---|---|
| `UserSuspended` | suspend (exists today) | "Your FoC account has been suspended. Contact an administrator if you think this is a mistake." |
| `UserReactivated`, `previousStatus: SUSPENDED` | reactivate (§4.3, new) | "Your FoC account has been reinstated. You can log in again." |
| `UserReactivated`, `previousStatus: DEACTIVATED` | reactivate (§4.3, new) | "Your FoC account has been reactivated." |

- **Consume `user.events`** with group `notification-service`.
  - Handle the two types above, and skip other types (e.g. `UserRegistered`).
  - Unreadable events go to `notification.user-events.dlt`; add it to `infra/kafka/topics.txt` (root `AGENTS.md` §3 Messaging, rule 6).
- **Deduplicate on `eventId`,** as for order events (`notification-service/AGENTS.md`, Rules).
- **Get the recipient's email** from the User Service endpoint already decided for Notification (#151). The events carry no email.
  - A suspended or deactivated user must still be looked up; the endpoint must not return only `ACTIVE` users.
- **Never include the suspension reason.** The events don't carry it, and it is the admins' internal note.
- **On suspension the user may get several emails.** Order cancels their unfinished orders and publishes `OrderCancelled` (reason `USER_SUSPENDED`), which Notification already emails to both parties. This is expected.
- **Depends on** #151 (email lookup), #152 (consumer) and #153 (sending), all open. **Fallback** if they aren't ready by the D4 deadline: the User Service sends both emails itself with its existing `MailService` (used for OTPs) after the suspend or reactivate commits, and the events stay for later.
- Widens Notification beyond order emails (Backlog NTFR covers order states only). Needs a backlog entry.

## 7. API Gateway

| File | Add |
|---|---|
| `envoy/routes/10-user.routes.json` | `GET /admin/users/login-summary` (path), `GET /admin/users/[^/]+/login-events` (regex) |
| `envoy/routes/30-order.routes.json` | `GET /admin/orders` (path), `GET /admin/orders/overview` (path), `GET /admin/orders/[^/]+/history` (regex) |

All of these need a JWT (no `public`). Suspend, reactivate and `GET /admin/users` are already routed. `/admin/credits/**` stays unrouted. Update `test/envoy_routes_test.py` and the routing rule in `api-gateway/AGENTS.md`.

## 8. Frontend

**Stack (D17):** what `frontend/` already uses.
- Next.js 16 App Router; read `frontend/AGENTS.md` first.
- `@tanstack/react-query` for fetching and 15 s polling (as `home/page.tsx` does).
- Tailwind utility classes plus the shared classes in `app/globals.css`.
- No new libraries.
- The mockup shows what to display, not the exact look.
- Pages must work on desktop and mobile, with tables scrolling sideways on a phone.

### 8.1 Proxy: `app/api/session/admin/[...path]/route.ts`

One allowlist, following `api/session/orders`. Anything else returns 404. POSTs need a same-origin request. Everything goes through `protectedGateway`, and queries pass through unchanged because each service validates them strictly.

| Method | `/api/session/admin/…` | Upstream |
|---|---|---|
| GET | `users` | `/admin/users` |
| GET | `users/login-summary` | `/admin/users/login-summary` |
| GET | `users/:uuid/login-events` | `/admin/users/:uuid/login-events` |
| POST | `users/:uuid/suspend` | `/admin/users/:uuid/suspend` (JSON body) |
| POST | `users/:uuid/reactivate` | `/admin/users/:uuid/reactivate` |
| PATCH | `users/:uuid/role` | `/admin/users/:uuid/role` (JSON body `{ "role": "ADMIN" \| "USER" }`) |
| GET | `orders` | `/admin/orders` |
| GET | `orders/overview` | `/admin/orders/overview` |
| GET | `orders/:uuid/history` | `/admin/orders/:uuid/history` |

**Role changes [Decided, Zi Yi, 2026-11-10]:** the user page and a new Admins page (`/admin/admins`: current admins, and a search to make a user an admin) promote and demote admins, so the proxy forwards `PATCH users/:uuid/role`. The User Service already enforces ADMIN, re-reads the caller's role under its lock, refuses last-admin and self demotion, and audit-logs each change. Accepted risk: a hijacked admin session could promote another account, and a demoted admin keeps admin access in the other services until their token expires (up to 15 minutes).

### 8.2 Pages

| Route | Use case | Notes |
|---|---|---|
| `app/admin/page.tsx` | UC6 | Three cards and two lists from `orders/overview`, `users/login-summary` and `users?status=SUSPENDED`, polled every 15 s. Empty lists say "Nothing in the last hour." |
| `app/admin/orders/page.tsx` | UC1 | Live/Past toggle, state select, user search, paged table. Live polls every 15 s. A row opens `OrderPanel`. |
| `app/admin/logins/page.tsx` | UC2 | The 24 h count, then the flagged table. Empty state: "No user has more than 10 failed logins in the last 24 hours." |
| `app/admin/users/page.tsx` | UC4 | Suspended/Deactivated toggle over `GET /admin/users?status=` |
| `app/admin/users/[userId]/page.tsx` | UC5, UC3 | Header, action button and dialog, Orders tab (`/admin/orders?userId=`, `OrderPanel`), Login history tab |

Shared pieces:
- `app/admin/admin-page.tsx`: the role gate, moved out of `admin/locations/page.tsx` (redirect to `/signin` or `/home`), plus admin navigation: Overview · Orders · Logins · Users · Admins · Locations (Admins added 2026-11-10).
- `app/admin/order-panel.tsx`: order details and the timeline from `/history`. A cancellation shows `changeDetails.reason`.
- `lib/admin.ts`: types, fetch functions and React Query keys. It reuses `Order` from `lib/orders.ts`.
- **Names:** orders store user ids, not names. The admin pages download the full user list once (`GET /admin/users`, cached for 60 s) and use it to:
  - show names next to orders;
  - turn a typed name or email into a `userId` for the search.

  That's instant for hundreds of users. (`ponytail:` with tens of thousands, the download and the User Service decrypting every email get slow; then add a server-side search parameter and a fetch-one-user endpoint.)
- **Suspend dialog:** reason textarea (required, 1–500 characters) and the UC3 warnings. The button is hidden on your own page; the session status already carries `userId`.
- **Errors:** show `error.message` for 409 `CANNOT_MODIFY_SELF`, `USER_NOT_ACTIVE` and `USER_ALREADY_ACTIVE`. After a successful suspend or reactivate, invalidate the users and login-summary queries.
- **Entry point:** add an "Admin dashboard" link to `/admin` next to "Manage Locations" in `location-browser.tsx`, shown to ADMIN only.

## 9. Tests

**User Service** (vitest; database tests against PostgreSQL in Docker):
- Login recording:
  - a wrong password writes `WRONG_PASSWORD`, and the 5th within 15 min writes `LOCKED`;
  - an unknown email, or an attempt while already locked, writes nothing;
  - suspended or deactivated with the correct password writes `SUSPENDED` or `DEACTIVATED`;
  - success writes `SUCCESS`;
  - a failing insert fails the login.
- `login-summary`:
  - 11 failures are flagged and 10 are not;
  - rows older than 24 h are ignored;
  - `SUSPENDED` and `DEACTIVATED` outcomes are not counted;
  - results are sorted by count, highest first;
  - `lockedNow` counts only locks started in the last 15 min;
  - `recentFailures` covers only the last hour, newest first.
- Suspend: a missing, empty or over-long reason, or an unknown field, returns 400; a successful suspend sets the reason and `suspended_at`.
- Reactivate:
  - `SUSPENDED` becomes `ACTIVE`, the columns are cleared, and exactly one `UserReactivated` outbox row has `previousStatus: SUSPENDED`;
  - `DEACTIVATED` works the same way;
  - `ACTIVE` returns 409 `USER_ALREADY_ACTIVE` and writes no event.
- A USER token on every new route returns 403.

**Order Service** (`compose.test.yaml`):
- Overview:
  - `byState` counts all five live states, zeros included;
  - `recentCancellations` holds only `CANCELLED` orders from the last hour, newest first.
- List:
  - scope, state and userId filters (requester and courier);
  - a state outside its scope returns 400;
  - `AWAITING_CREDIT` is never listed;
  - paging totals are correct.
- History of an unknown order returns 404.
- A USER gets 403.
- A `UserReactivated` event is skipped.

**Notification:**
- a `UserSuspended` event sends the suspension email;
- a `UserReactivated` event sends the right email for each `previousStatus`;
- a repeated `eventId` sends nothing;
- other `user.events` types are skipped.

**Gateway:**
- the new routes are forwarded;
- `/admin/credits/dead-letters` still returns 404.

**Frontend** (`test/routes.test.mjs`):
- the admin proxy forwards allowed paths with their query and returns 404 for others;
- a cross-origin POST is refused;
- a USER opening `/admin/*` is redirected.

**Demo script (D4):**
1. Log in to bob's account with a wrong password 5 times.
   - **Overview** shows 1 locked account and the failures.
   - Repeat after the lock ends until bob has 11 failures; he then appears on **Logins**.
2. Open bob's page and review his orders and login history.
3. Suspend him with a reason:
   - his live order becomes `CANCELLED` with reason `USER_SUSPENDED` and appears under the Overview's recent cancellations;
   - his login returns 403 `ACCOUNT_SUSPENDED`;
   - he is listed under **Suspended** with the reason;
   - he gets the "suspended" email in Mailpit.
4. Reactivate bob. He gets the "reinstated" email in Mailpit and can log in again.
5. A USER calling `GET /admin/orders` gets 403.

Seed `login_events` rows directly in the database to skip the waiting in step 1.

## 10. Docs to update

- `user-service/API.md` and `user-service/AGENTS.md`: the schema, suspend/reactivate changes, `USER_ALREADY_ACTIVE`, the new routes, and `UserReactivated` in the Events section.
- `order-service/AGENTS.md` and README: the admin read routes.
- `notification-service/AGENTS.md`: `user.events` consumer, and the suspension and reactivation emails.
- `api-gateway/AGENTS.md`: the routing rule.
- Root `AGENTS.md` §5: the capability table rows for admins (view all orders, login audit logs, reactivate suspended accounts).
- Every AI-assisted file needs the disclosure header and an entry in the author's `ai/usage-log/<member>.md`.

## 11. Approvals needed

| From | What |
|---|---|
| User Service owners (Deanson, Zi Yi) | §4.1 schema in `001_init.sql` (everyone resets user-db), P8 (the login timing difference, and the updated `login()` comments), the suspend body and the `USER_ALREADY_ACTIVE` rename (breaking changes), reactivate widening and the `UserReactivated` event, the two new routes. **Approved by Zi Yi, 2026-11-05.** |
| Order owners (Zi Yi, Jie Yang) | §5 admin read routes. `order-service/AGENTS.md` says "Do not infer additional admin powers" from the root table. |
| Notification owner (Jie Yang) | §6: consuming `user.events` (`UserSuspended`, `UserReactivated`), the two emails, the new dead-letter topic, and #151 returning suspended and deactivated users |
| Gateway owner (Jie Yang) | §7 routes, and the `NOT_DEACTIVATED` assertion in the gateway Postman collection |

## 12. Order of work

1. **User Service PR:** §4 and its tests.
2. **Order Service PR:** §5 and its tests.
3. **Gateway PR:** §7.
4. **Notification PR:** §6, once #151–#153 land. Otherwise use the §6 fallback inside PR 1.
5. **Frontend PR:** §8, after 1–3 are merged.

PRs 1–3 don't depend on each other and can be built in parallel.
