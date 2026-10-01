<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
Scope: Generated run and test instructions for the Supplier Service.
Author review (Cole Lin): Read in full; followed the steps on a clean setup and confirmed they work.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Added the "Run with Docker Compose" section.
Author review (Jian Bing): Asked for it with supplier-service/compose.yaml; the commands are the ones
Claude Code ran in its 2026-09-29 test of the compose file. Ran `docker compose up --build` myself:
the service started on 3002 and GET /locations without a token returned 401.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
Scope: Rewrote the "Tests" section for the Jest unit and integration tests.
Author review (Jian Bing): Followed the "Tests" steps on 2026-10-01: `npm test` (157 passed) and
`npm run test:int` against supplier-db (51 passed).
-->

# Supplier Service

Manages campus locations (the brief's "suppliers"): simple CRUD, search, soft delete and restore. Design decisions are in [`AGENTS.md`](AGENTS.md).

Stack: NestJS (TypeScript, Node.js), PostgreSQL via `pg` with plain SQL, Zod for validation.

## Run with Docker Compose

From the repository root, after `cp .env.example .env` and filling in the secrets:

```bash
docker compose up --build                                                          # whole project
docker compose -f supplier-service/compose.yaml --env-file .env up --build        # Supplier only
```

The service is on http://localhost:3002, and its own database on `localhost:5434` (password `SUPPLIER_POSTGRES_PASSWORD`). Run on its own, requests with a token get 503 because the User Service isn't there to verify them; the header fallback is not available in the container.

## Run it locally

1. **Start PostgreSQL.** With Docker Desktop installed:

   ```bash
   docker run --name foc-supplier-db -e POSTGRES_PASSWORD=<choose-a-password> -e POSTGRES_DB=supplier -p 5432:5432 -d postgres:17
   ```

2. **Configure.** In the repo root, copy `.env.example` to `.env` (git-ignored) and set:

   ```
   SUPPLIER_DATABASE_URL=postgres://postgres:<your-password>@localhost:5432/supplier
   SUPPLIER_JWKS_URL=http://localhost:3001/.well-known/jwks.json
   ```

   `SUPPLIER_PORT` defaults to 3002.

3. **Install and start** (from `supplier-service/`):

   ```bash
   npm install
   npm run start:dev
   ```

On startup the service creates its tables if they don't exist and, **only if there are no locations yet**, loads the 21 locations from `data/csv/supplier-seed-data.csv`. To re-seed from scratch, drop the database (e.g. `docker rm -f foc-supplier-db`) and start again.

## Tests

```bash
npm test          # unit tests, no containers needed
npm run test:int  # integration tests, needs the supplier-db container
```

Jest, as in the User Service: each `*.spec.ts` sits next to the file it tests.

`npm test` is offline and fast. It covers the opening-hours conversion, request validation, token
verification against a stub JWKS server (including forged, expired and wrong-algorithm tokens, and
how the keys are cached), the auth guard's 401/403/503 answers and dev-auth fallback, the error
format, and startup configuration, including that `SUPPLIER_DEV_AUTH=true` is refused when
`NODE_ENV=production` (the Dockerfile sets that, so the container cannot run with the header
fallback enabled).

The integration tests (`*.int.spec.ts`) run `LocationsService` and the seed loader against a real
PostgreSQL: filters, paging, sorting, distance, the 409 rules and the seed. Start the database
first, from the repo root (if you have a root `.env`, `docker compose up -d supplier-db` also works):

```bash
docker compose -f supplier-service/compose.yaml up -d supplier-db   # no root .env needed
npm run test:int                          # all integration tests
npm run test:int -- src/locations         # or just some
```

They use their own database, `supplier_test`, which they create in that container and empty before
every test, so your own data in `supplier` is never touched. They connect with
`SUPPLIER_POSTGRES_PASSWORD` from the repo-root `.env`; set `SUPPLIER_TEST_DATABASE_URL` to use
another server (its database name must end in `_test`).

Neither run reads your `.env` for anything else: the test setup pins every Supplier setting, so a
local `NODE_ENV=production` or `SUPPLIER_DEV_AUTH=true` cannot change the results.

## Test with Postman

Import `postman/supplier.postman_collection.json`. Set the collection variable `baseUrl` if your port differs. Run **Create location** before the update, deactivate and restore requests; it stores the new `locationId` and `version`.

**Re-seed before each collection run.** The collection creates a location with a fixed name, and names must be unique among ACTIVE locations, so a second run would hit 409. Empty the table, then restart the service so it seeds again:

```bash
docker exec foc-supplier-db psql -U postgres -d supplier -c "TRUNCATE locations RESTART IDENTITY;"
```

**Auth:** every request needs `Authorization: Bearer <token>`, with a token issued by the User Service. This service verifies it against the User Service's JWKS (`SUPPLIER_JWKS_URL`), so that service must be running. Missing or invalid → 401, wrong role → 403, JWKS unreachable → 503. Put a token in the collection's `adminToken` and `userToken` variables.

**Testing Supplier on its own:** start it with `SUPPLIER_DEV_AUTH=true` and leave those variables empty. The service then accepts the `X-User-Id` / `X-User-Role` headers the collection already sends, and needs no other service running. The flag is off by default, is refused when `NODE_ENV=production`, and a real token still wins over the headers. Use it on your own machine only.

## Endpoints

| Method & path | Access |
|---|---|
| `GET /locations?name=&type=&building=&time=&lat=&lon=&includeInactive=&order=&page=&pageSize=` | any authenticated user; `includeInactive=true` is ADMIN only |
| `GET /location-types` | any authenticated user |
| `GET /locations/:locationId` | any authenticated user |
| `POST /locations` | ADMIN |
| `PATCH /locations/:locationId` | ADMIN (body must include `version`) |
| `POST /locations/:locationId/deactivate` | ADMIN |
| `POST /locations/:locationId/restore` | ADMIN |

`GET /locations` returns `{ items, page, pageSize, total }` (20 per page by default). `order=asc` (default) sorts by name A→Z, `order=desc` gives Z→A. Pass a GPS coordinate as `lat`/`lon` (decimal degrees) to get `distance_m` on each item, and `order=distance` for nearest first. Errors are returned as Problem Details (`application/problem+json`).
