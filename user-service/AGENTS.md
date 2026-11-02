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
Scope: Wrote the "Internal API" section (#151).
Author review: pending — Jie Yang to record the review; Deanson / Zi Yi (User owners) to review.
-->

# AGENTS.md — User Service

Read the root [`AGENTS.md`](../AGENTS.md) first. This file holds rules specific to the User
Service. Only the Events and Internal API sections exist so far; the rest (schema, credentials, tokens, OTPs, role
lifecycle) is still to be written back after the refactor.

## Internal API (`/internal/users`)

_Origin: Team (Jie Yang, 2026-10-27: Notification looks up emails through a User endpoint; shape approved 2026-11-02, #151). Deanson and Zi Yi (User owners) to confirm._

Service-to-service routes. They need `X-Service-Key: <USER_INTERNAL_SERVICE_KEY>` instead of a user
token (a user token alone gets 401), and the gateway never routes `/internal/**`.

| Route | Caller | Responses |
|---|---|---|
| `GET /internal/users/:userId/contact` | Notification Service, when sending an email | 200 `{ "email": "..." }` · 400 not a UUID · 401 missing or wrong key (`SERVICE_KEY_INVALID`) · 404 unknown user |

- **[Decided]** The email is returned for any existing user, whatever their status: a suspended or
  deactivated user still hears that their orders were cancelled.
- The email is never logged, and never appears in an error.
- The key is compared in constant time (`src/common/guards/service-key.guard.ts`, copied from Order).
- `USER_INTERNAL_SERVICE_KEY` is required at startup (at least 32 characters). Each caller holds the
  same value under its own variable.

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

Consumer: the Order Service cancels the user's unfinished orders (`order-service/AGENTS.md`).

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
- Today's two types can't overlap: only an ACTIVE account can be suspended, so the suspension's
  transaction starts after the `UserRegistered` one committed, and an account is suspended at
  most once. A new type that can overlap another needs the claim order revisited.
