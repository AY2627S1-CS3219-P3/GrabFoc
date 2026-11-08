<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
Scope: Wrote this README for the scaffold (#149).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
Scope: Updated the summary and added the integration and Kafka test commands (#150, #152).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
Scope: Updated the summary for sending (#153) and added Mailpit to the table.
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
Scope: Updated the summary for retries (#154).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
Scope: Updated the summary for account emails (#183).
Author review: pending — Jie Yang to record the review.
-->

# Notification Service

Emails the requester and courier when an order changes state. Rules and status: [`AGENTS.md`](AGENTS.md).

**So far (#149, #150, #152, #153, #154, #183):** the service consumes `order.events`, records each event, looks up each recipient's email from the User Service and sends the email. A send that may succeed later (User or SMTP down) is retried after `NOTIFICATION_RETRY_DELAYS` (default `1s,5s,30s,2m,10m`), unless the order has moved on by then (#154). It also consumes `user.events` and emails a user whose account is suspended or reactivated (#183).

Needs `USER_INTERNAL_SERVICE_KEY` in the root `.env` (the same value the User Service checks).

## Run

With everything else, from the repo root:

```bash
docker compose up --build notification-service
```

| What | Where |
|---|---|
| Service | http://localhost:3006/health |
| Sent emails (Mailpit) | http://localhost:8025 |
| Database, from the host | `localhost:5436`, database `notification`, user `foc`, password `NOTIFICATION_POSTGRES_PASSWORD` |

On the host instead of Docker (Node 22.12 or newer; `.nvmrc` pins 24), with the `NOTIFICATION_*` variables in [`.env.example`](../.env.example) set in the root `.env`:

```bash
npm install
npm run start:dev
```

## Test

```bash
npm test
```

Integration tests, against a `notification_test` database on `notification-db`:

```bash
docker compose up -d notification-db
npm run test:int
```

Kafka tests, on their own prefixed topics:

```bash
docker compose up -d kafka notification-db
npm run test:kafka
```
