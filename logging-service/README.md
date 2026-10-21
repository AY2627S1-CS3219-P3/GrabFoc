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

Services produce log lines to the Kafka topic `logging.lines`, and this service consumes them
(`src/ingest/kafka.consumer.ts`). A line it cannot store goes to `logging.lines.dlt` with the same
headers Credit uses.

With `LOGGING_KAFKA_BROKERS` unset, ingest is off and the query API still runs — a normal way to run
the service, not a failure. Both topics must exist in `infra/kafka/topics.txt`; the service refuses
to start if they are missing rather than letting lines vanish, because services never create topics.

The API Gateway does **not** publish here. Envoy has no Kafka access logger, so its lines stay on
stdout; see "Ingest" in `AGENTS.md` for what that costs.

## Demo: one request, traced

Verified end to end on 2026-10-21. From the repository root, with `.env` in place:

```bash
docker compose up -d kafka kafka-init logging-db logging-service supplier-db supplier-service
```

Wait for `Consuming "logging.lines"` in `docker logs foc-logging-service-1`, then make a request that
will be refused, with an id of your choosing:

```bash
curl.exe -i -X POST "http://localhost:3002/locations" -H "x-request-id: d3-demo-1"
```

That returns **401** and echoes `x-request-id: d3-demo-1`. The line is then in the store:

```bash
docker exec foc-logging-db-1 psql -U foc -d logging -c "SELECT request_id, service, event, status, path FROM log_lines ORDER BY received_at DESC LIMIT 5;"
```

Through the API instead — ADMIN only, and there is no dev-header fallback here, so this needs a real
token from the User Service:

```bash
curl.exe "http://localhost:3006/logs?requestId=d3-demo-1" -H "Authorization: Bearer $env:ADMIN_TOKEN"
```

Two more worth showing, both verified:

- **The query string never reaches the store.** `POST /locations?lat=1.2966&lon=103.7764` stores
  `path` as `/locations` — those coordinates are the caller's position, on a line that also names them.
- **A bad message is parked, not lost, and does not stop the consumer.**

  ```bash
  echo 'this is not a log line' | docker exec -i foc-kafka-1 /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic logging.lines
  docker exec foc-kafka-1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic logging.lines.dlt --from-beginning --max-messages 1 --property print.headers=true
  ```

  The dead letter carries `x-error`, `x-source-topic`, `x-source-partition`, `x-source-offset` and
  `x-dead-lettered-at`, with the original bytes unchanged.

Kafka UI is on <http://127.0.0.1:8085> and shows the messages on both topics, which is the clearest
way to make "asynchronous" visible rather than asserted.

### Two things that will bite on Windows

**`localhost` vs `127.0.0.1`.** The broker advertises `EXTERNAL://localhost:9094`, so a client run on
the host is told to reconnect to `localhost`, which can resolve to IPv6 `[::1]` and fail — the broker
only binds IPv4. Inside Compose it is `kafka:9092` and this does not arise, which is why the demo
runs in containers. It does affect host-run tools, including Credit's Kafka tests.

**Line endings.** `infra/kafka/` now has a `.gitattributes` forcing LF. Without it, git checks out
`create-topics.sh` with CRLF and the container shell reads `set -eu\r` as an illegal option, and
`topics.txt` with CRLF so a partition count arrives as `"3\r"`. Either way `kafka-init` creates
nothing, and every Kafka demo on that machine fails.

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
