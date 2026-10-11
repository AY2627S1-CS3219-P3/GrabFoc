<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
Scope: Wrote the run and test instructions for the Credit Service.
Author review: pending — Jian Bing to record what he checked.
-->

# Credit Service

Holds every user's credits and moves them for the Order Service: **reserve** when an order is
created, **transfer** to the courier when it completes, **release** back to the requester when it
is cancelled. Design, schema and API: [`AGENTS.md`](AGENTS.md).

## Run it

```bash
# Once: give it a service key (shared with the Order Service) in the repo-root .env
echo "CREDIT_SERVICE_KEY=$(openssl rand -hex 32)" >> .env

docker compose up credit-service      # from the repo root; starts credit-db too
```

It listens on port **3004**. Its database is `credit-db` on host port **5435**. The gateway does
not route to it: only the Order Service calls it.

To run it outside Docker, set `CREDIT_DATABASE_URL` and `CREDIT_SERVICE_KEY` (see `.env.example`),
then `npm install && npm run start:dev` in this folder.

## Try it

```bash
KEY=<your CREDIT_SERVICE_KEY>
curl -X POST localhost:3004/internal/credits/reserve \
  -H 'content-type: application/json' -H "x-service-key: $KEY" \
  -d '{"orderId":"11111111-1111-4111-8111-111111111111","requesterId":"22222222-2222-4222-8222-222222222222","amount":3}'
```

Send it twice: the first answers 201, the second 200 with the same body, and the balance only
moves once.

### With Postman

Import `postman/credit.postman_collection.json`, set its `serviceKey` variable to your
`CREDIT_SERVICE_KEY`, and run each folder top to bottom. Every folder starts with fresh ids, so
you can re-run it as often as you like.

## Test it

```bash
npm test             # unit tests: request schemas, service-key guard
docker compose up -d credit-db        # from the repo root
npm run test:int     # integration tests against the credit_test database
```

The integration tests use their own `credit_test` database in the `credit-db` container and empty
it before every test. They include concurrent requests: ten identical reserves at once, five
orders racing for one balance, and transfer racing release.
