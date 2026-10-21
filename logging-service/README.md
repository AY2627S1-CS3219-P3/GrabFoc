<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
Scope: Generated this README from the plan Cole Lin approved on 2026-10-16.
Author review: Cole Lin, read and approved.
-->

# Logging Service

Collects the structured log lines every service writes and makes them searchable by request, so one
user action can be followed across services. Nice-to-have, tracked by issue #52. Design decisions
are in [`AGENTS.md`](AGENTS.md).

Stack: NestJS (TypeScript, Node.js), PostgreSQL via `pg` with plain SQL, Zod for validation.

## Run with Docker Compose

From the repository root, after `cp .env.example .env` and filling in the secrets:

```bash
docker compose up --build
```

Or this service and its database alone:

```bash
docker compose -f logging-service/compose.yaml --env-file .env up --build
```

It listens on `3006` and `logging-db` on `5436`.

## Ingest

Services produce log lines to the Kafka topic `logging.lines`. The consumer is not wired up yet: the
shared broker arrives with #75, and `src/ingest/consumer.ts` is the seam it plugs into. Until then:

- with `LOGGING_KAFKA_BROKERS` unset, ingest is off and the query API runs — this is a normal way to
  run the service, not a failure;
- with it set and no consumer provided, startup says so and the query API still runs.

The API Gateway does **not** produce to this topic. Envoy has no Kafka access logger, so its lines
stay on stdout; see "Ingest" in `AGENTS.md` for what that costs.

## Reading the logs

`GET /logs` is ADMIN only and needs a real bearer token from the User Service — there is no
dev-header fallback here, unlike the Supplier Service. Filters: `requestId`, `service`, `event`,
`userId`, `level`, `status`, `from`, `to`, plus `page` and `pageSize` (at most 200).

```bash
curl.exe "http://localhost:3006/logs?requestId=9f3c0b1e-..." -H "Authorization: Bearer $env:ADMIN_TOKEN"
```

## Environment

Every variable lives in the repository-root `.env` (see `.env.example`); this folder has no `.env`
of its own.

| Variable | Default | Notes |
|---|---|---|
| `LOGGING_PORT` | `3006` | Order already publishes 3005 |
| `LOGGING_KAFKA_GROUP_ID` | `logging-service` | |
| `LOGGING_PURGE_INTERVAL_MINUTES` | `60` | |
| `LOGGING_DATABASE_URL` | — | Required |
| `LOGGING_JWKS_URL` | — | Required. The User Service's public keys |
| `LOGGING_JWT_ISSUER`, `LOGGING_JWT_AUDIENCE` | unset | Checked only when set |
| `LOGGING_KAFKA_BROKERS` | unset | Unset means ingest is off |
| `LOGGING_KAFKA_TOPIC` | `logging.lines` | Must exist in `infra/kafka/topics.txt` (#75) |
| `LOGGING_KAFKA_GROUP_ID` | `logging-service` | |
| `LOGGING_RETENTION_DAYS` | `30` | The purge job deletes anything older |
| `LOGGING_PURGE_INTERVAL_MINUTES` | `60` | |
| `LOGGING_POSTGRES_PASSWORD` | `change-me-in-dotenv` | Used by `compose.yaml` |
| `LOGGING_TEST_DATABASE_URL` | `logging_test` on `5436` | Integration tests only |

## Tests

```bash
npm test
npm run test:int
```

`npm test` is offline and covers the inbound-line envelope, the query parameters, the ingest path
against an in-process fake consumer, the guard's 401/403/503 answers, startup configuration, and the
shipper that other services copy. `npm run test:int` runs the store against a real PostgreSQL and
needs the database container:

```bash
docker compose -f logging-service/compose.yaml up -d logging-db
```
