<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
Scope: Wrote the Events section from Deanson's outbox design and the code that implements it.
Author review: pending — Deanson to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-20
Scope: Added UserSuspended (#72) and why per-user order still holds with two event types.
Author review: Reviewed and tested by Zi Yi on the merged compose stack, 2026-10-21.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-21
Scope: Recorded that the Order Service now consumes UserSuspended.
Author review: Tested by Zi Yi (unit and compose.test.yaml integration tests), 2026-10-21.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
Scope: Added UserReactivated, the Notification Service as a UserSuspended consumer, the claim
  order for three types, and the login_events table (#180, docs/admin-dashboard-plan.md).
Author review: Reviewed by Zi Yi, 2026-11-05.
-->

# AGENTS.md — User Service

Read the root [`AGENTS.md`](../AGENTS.md) first. This file holds rules specific to the User
Service. Only the Events and Login audit sections exist so far; the rest (schema, credentials,
tokens, OTPs, role lifecycle) is still to be written back after the refactor.

## Events (`user.events`)

_Origin: Team (Deanson's design, 2026-10-19: transactional outbox, polling relay, payload, no
backfill); AI doc (wording, and details Claude Code proposed and Deanson accepted: no Compose
dependency on Kafka, client-level timeouts, a fresh producer after each failure, a loop that
always reschedules)._

The User Service owns `user.events` (root `AGENTS.md` §3 Messaging, rule 3). Consumers adapt to
the shapes below and ask the User Service owners if they need more.

### `UserRegistered`

Sent once per account, when the account is created:
- `POST /auth/register/verify` creates the account;
- the first-admin bootstrap creates the bootstrap ADMIN.

| | |
|---|---|
| Topic | `user.events` (created by `infra/kafka`; this service creates no topics) |
| Key | `userId` |
| Value | UTF-8 JSON, below |

```json
{ "type": "UserRegistered", "eventId": "<uuid>", "userId": "<uuid>", "occurredAt": "<ISO 8601>" }
```

- `userId` is the same id as the access token's `sub`.
- `eventId` is unique per event and stays the same if the event is sent again.
- `occurredAt` is the account's `created_at`.
- No personal data: no email, mobile or display name (NFR5.1).
- **No backfill:** accounts created before the outbox existed (migration `002_outbox.sql`) never
  got this event.

Consumer today: the Credit Service creates the wallet with the starting credits.

### `UserSuspended`

Sent when `POST /admin/users/:userId/suspend` commits (#72). Same topic, key and shape as
`UserRegistered`; `occurredAt` is the time of the suspension.

```json
{ "type": "UserSuspended", "eventId": "<uuid>", "userId": "<uuid>", "occurredAt": "<ISO 8601>" }
```

Consumers:
- the Order Service cancels the user's unfinished orders (`order-service/AGENTS.md`);
- the Notification Service emails the user that the account is suspended (#183).

The suspension reason is stored on the account (`users.suspension_reason`), not in the event.

### `UserReactivated`

_Origin: Team (docs/admin-dashboard-plan.md, P11, #180)._

Sent when `POST /admin/users/:userId/reactivate` commits, from `SUSPENDED` or `DEACTIVATED`. Same
topic and key as above, plus `previousStatus`; `occurredAt` is the time of the reactivation.

```json
{ "type": "UserReactivated", "eventId": "<uuid>", "userId": "<uuid>", "occurredAt": "<ISO 8601>", "previousStatus": "SUSPENDED" }
```

- `previousStatus` is `SUSPENDED` or `DEACTIVATED`, so the email can say "reinstated" or
  "reactivated".
- Consumer: the Notification Service (#183). The Order and Credit Services skip it, as they skip
  any type they don't handle.

### Delivery: transactional outbox

1. The account row and an `outbox` row are written in **one transaction**
   (`AuthService.verify`, `UsersService.onApplicationBootstrap`). If the transaction rolls back
   (e.g. the email was taken meanwhile), there is no event either. The request never waits on
   Kafka.
2. `OutboxRelay` (`src/infra/outbox/outbox.relay.ts`) polls every `USER_OUTBOX_POLL_MS` (1 s).
   - Each tick claims up to 50 pending rows, oldest first, with `FOR UPDATE SKIP LOCKED`, so
     replicas never claim the same row.
   - It sends them in one batch and marks them `published_at` in the same transaction.
3. On any failure (Kafka or the database), the tick:
   - rolls back, so nothing is marked;
   - reports the failure;
   - discards the producer;
   - doubles its delay up to `USER_OUTBOX_MAX_BACKOFF_MS` (30 s) and retries forever.

   The first successful tick resets the delay to 1 s. The next tick is always scheduled in a
   `finally`, so the loop cannot stop silently.
4. **At least once.** A crash after the send but before the commit sends the event again; so
   does a batch that fails partway. **Consumers must be idempotent**, e.g. key on `userId` or
   `eventId`.
5. The service starts and accepts sign-ups with Kafka down. Compose has no `depends_on` on Kafka
   on purpose.

### Failures and monitoring

- The outbox has no failure columns. The logs are the only history of failures:
  - `OUTBOX_RELAY_FAILED` (error level): event ids, the error message and the age of the oldest
    pending event.
  - `OUTBOX_BACKLOG_STALE` (warn level): once that age passes 60 s, meaning the relay is stuck
    rather than slow.
- `reportRelayFailure` has a `TODO(logging-service)` where the push to centralized logging goes.
- A row that can never be sent (e.g. `user.events` missing) blocks the rows behind it and keeps
  raising both lines until someone fixes the cause.
- Pending events: `SELECT count(*), min(created_at) FROM outbox WHERE published_at IS NULL;`

### Before adding another event type

- Add a builder next to `src/users/user-events.ts`, write it with `OutboxRepository.add(event, tx)`
  in the transaction that makes the change, and document it here.
- `created_at` is the transaction's *start* time, not its commit order, so two events for one
  user written by overlapping transactions can be claimed out of order.
- `UserRegistered` can't overlap the others: only an existing ACTIVE account can be suspended.
- `UserSuspended` and `UserReactivated` for one user can follow each other, any number of times.
  Both run under the admin lock (`withAdminLock`, which locks the caller and every active
  admin), so two admins' requests run one after the other, never together. A
  `UserReactivated` written right after a `UserSuspended` could still, in theory, be claimed
  first; the only effect would be the "reinstated" email arriving before the "suspended" one.
  Accepted (#180). A new type needs the same check.

## Login audit (`login_events`)

_Origin: Team (docs/admin-dashboard-plan.md §4.1–§4.2, D5, D6, D9, P7, P8; #180)._

`AuthService.login` writes one row per attempt on an existing account, for the admin dashboard
(`GET /admin/users/login-summary`, `GET /admin/users/:userId/login-events`).

| Attempt | `outcome` |
|---|---|
| Wrong password | `WRONG_PASSWORD` |
| Wrong password that starts the lock | `LOCKED` |
| Correct password, account `SUSPENDED` / `DEACTIVATED` | `SUSPENDED` / `DEACTIVATED` |
| Tokens issued (same transaction as the session) | `SUCCESS` |
| Unknown email, or the address already locked | nothing |

- A failed login is `WRONG_PASSWORD` or `LOCKED`. More than 10 in 24 hours flags the account.
- The insert is awaited: if it fails, the login fails, so the log has no silent gaps.
- **Timing trade-off (P8):** only a wrong password writes a row, so it answers one insert slower
  than an unknown email. Accepted by Zi Yi (User Service owner).
- No retention or purge yet (P7).
- Columns `users.suspension_reason` and `users.suspended_at` are set by suspend and cleared by
  reactivate. Both, and the table, are in `001_init.sql` (edited in place): an existing user-db
  must be reset once (`docker volume rm foc_user-db-data`, or `docker compose down -v`).
