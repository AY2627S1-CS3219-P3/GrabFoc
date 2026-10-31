<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
Scope: Wrote this README for the scaffold (#149).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
Scope: Updated the summary and added the integration and Kafka test commands (#150, #152).
Author review: pending — Jie Yang to record the review.
-->

# Notification Service

Emails the requester and courier when an order changes state. Rules and status: [`AGENTS.md`](AGENTS.md).

**So far (#149, #150, #152):** the service consumes `order.events`, records each event and queues one notification per recipient. It doesn't send emails yet (#153).

## Run

With everything else, from the repo root:

```bash
docker compose up --build notification-service
```

| What | Where |
|---|---|
| Service | http://localhost:3006/health |
| Database, from the host | `localhost:5436`, database `notification`, user `foc`, password `NOTIFICATION_POSTGRES_PASSWORD` |

On the host instead of Docker (Node 22.12 or newer; `.nvmrc` pins 24), with `NOTIFICATION_DATABASE_URL` set in the root `.env`:

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
