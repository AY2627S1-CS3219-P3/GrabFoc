<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
Scope: Wrote the Events section from Deanson's outbox design and the code that implements it.
Author review: pending — Deanson to record what he checked.
-->

# AGENTS.md — User Service

Read the root [`AGENTS.md`](../AGENTS.md) first. This file holds rules specific to the User
Service. Only the Events section exists so far; the rest (schema, credentials, tokens, OTPs, role
lifecycle) is still to be written back after the refactor.

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
- `created_at` is the transaction's *start* time, not its commit order. Once a user can have two
  events, per-user order is no longer guaranteed; revisit the claim order then.
