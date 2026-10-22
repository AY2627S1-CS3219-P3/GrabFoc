<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
Scope: Wrote the run and test instructions for the Credit Service.
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Added reading a balance and the Postman Balance folder.
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Added Kafka (wallets from UserRegistered), Node 24, the Kafka tests and the two-file
Compose command (PR #84 review).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Added credit commands, dead letters and the Postman Dead letters folder.
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: Listed CREDIT_JWKS_URL in the run-outside-Docker steps (PR #73 review).
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Host broker address localhost:9094 → 127.0.0.1:9094, so clients don't try IPv6 first (PR #96).
Author review: Jian Bing, 2026-10-22 — ran it locally in Docker, ran the npm test suites, checked the Kafka messages and their structure in Kafka UI, and reviewed the changed files on GitHub; it works as intended.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Wrote the 2026-10-22 Author review text above from Jian Bing's account of what he checked (PR #96).
Author review: Jian Bing supplied what it states; the wording is Claude's.
-->

# Credit Service

Holds every user's credits and moves them for the Order Service: **reserve** when an order is
created, **transfer** to the courier when it completes, **release** back to the requester when it
is cancelled. Design, schema and API: [`AGENTS.md`](AGENTS.md).

## Run it

```bash
# Once: give it a service key (shared with the Order Service) in the repo-root .env
echo "CREDIT_SERVICE_KEY=$(openssl rand -hex 32)" >> .env

docker compose up credit-service kafka-ui   # from the repo root; starts credit-db and Kafka too
```

Kafka is shared by every service, so it lives in [`infra/kafka`](../infra/kafka/README.md), not
here. To run only this service's Compose file, pass Kafka's too (from the repo root):
`docker compose --env-file .env -f infra/kafka/compose.yaml -f credit-service/compose.yaml up credit-service`.

The service consumes `user.events` from the shared Kafka broker ([`infra/kafka`](../infra/kafka/README.md)):
each `UserRegistered` creates that user's wallet with 10 credits. Watch the topics in Kafka UI at
http://localhost:8085; publishing `{"type":"UserRegistered","userId":"<uuid>"}` to `user.events`
there creates a wallet. An event without a valid `userId` lands on `credit.user-events.dlt`.

It also consumes `credit.commands`: `{"type":"TransferCredits","eventId","orderId","courierId"}`
and `{"type":"ReleaseCredits","eventId","orderId"}`. A command that can't be applied yet is
retried through `credit.commands.retry.*`; one that keeps failing, or never can succeed, lands on
`credit.commands.dlt`.

### Dead letters (admins)

```bash
# An ADMIN access token from the User Service
TOKEN=$(curl -s -X POST localhost:3001/auth/login -H 'content-type: application/json' \
  -d '{"email":"<admin email>","password":"<password>"}' | jq -r .accessToken)

curl -s localhost:3004/admin/credits/dead-letters -H "authorization: Bearer $TOKEN"          # open ones
curl -s -X POST localhost:3004/admin/credits/dead-letters/<eventId>/replay -H "authorization: Bearer $TOKEN"
```

Replay republishes a credit command to `credit.commands`; if it fails again, its row reopens. A
user-event dead letter can't be replayed (409 `NOT_REPLAYABLE`): the User Service has to fix and
re-publish it.

It listens on port **3004**. Its database is `credit-db` on host port **5435**. The gateway does
not route to it: only the Order Service calls it.

To run it outside Docker, start its dependencies from the repo root (`docker compose up -d
credit-db kafka-init user-service`; the User Service publishes the signing keys), set
`CREDIT_DATABASE_URL`, `CREDIT_SERVICE_KEY`, `CREDIT_JWKS_URL=http://localhost:3001/.well-known/jwks.json`
and `CREDIT_KAFKA_BROKERS=127.0.0.1:9094` (see `.env.example`), then `npm install && npm run start:dev`
in this folder (Node 24, see `.nvmrc`).

## Try it

```bash
KEY=<your CREDIT_SERVICE_KEY>
curl -X POST localhost:3004/internal/credits/reserve \
  -H 'content-type: application/json' -H "x-service-key: $KEY" \
  -d '{"orderId":"11111111-1111-4111-8111-111111111111","requesterId":"22222222-2222-4222-8222-222222222222","amount":3}'
```

Send it twice: the first answers 201, the second 200 with the same body, and the balance only
moves once.

### Read a balance

With a user's access token (their own id, or any id as an ADMIN). Until the gateway route is
added (PR #69), call the service directly:

    curl localhost:3004/credits/<userId> -H "authorization: Bearer <accessToken>"

`404` with `"code":"WALLET_NOT_FOUND"` means the user has no wallet yet. The service checks the
token against the User Service's public keys, so User Service must be running.

### With Postman

Import `postman/credit.postman_collection.json`, set its `serviceKey` variable to your
`CREDIT_SERVICE_KEY`, and run each folder top to bottom. Every folder starts with fresh ids, so
you can re-run it as often as you like. For the **4. Balance** folder, also set `userToken` (an
access token from `/auth/login`) and `userId` (that user's id). For **5. Dead letters**, also set
`adminToken` (an ADMIN's access token).

## Test it

```bash
nvm install && nvm use                # Node 24 (.nvmrc): the Kafka client has no prebuilt binary for Node 26
npm test             # unit tests: request schemas, service-key guard, message parsing
docker compose up -d credit-db        # from the repo root
npm run test:int     # integration tests against the credit_test database
docker compose up -d kafka            # from the repo root
npm run test:kafka   # end-to-end tests against the Compose broker (127.0.0.1:9094)
```

The Kafka tests create their own uniquely named topics and consumer group, so they never touch a
running Credit Service's messages, and delete the topics afterwards. Set
`CREDIT_TEST_KAFKA_BROKERS` to use another broker.

The integration tests use their own `credit_test` database in the `credit-db` container and empty
it before every test. They include concurrent requests: ten identical reserves at once, five
orders racing for one balance, and transfer racing release.
