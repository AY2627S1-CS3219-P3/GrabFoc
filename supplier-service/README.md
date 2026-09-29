<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
Scope: Generated run and test instructions for the Supplier Service.
Author review (Cole Lin): Read in full; followed the steps on a clean setup and confirmed they work.
-->

# Supplier Service

Manages campus locations (the brief's "suppliers"): simple CRUD, search, soft delete and restore. Design decisions are in [`AGENTS.md`](AGENTS.md).

Stack: NestJS (TypeScript, Node.js), PostgreSQL via `pg` with plain SQL, Zod for validation.

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
| `GET /locations?name=&type=&building=&time=&includeInactive=&order=&page=&pageSize=` | any authenticated user; `includeInactive=true` is ADMIN only |
| `GET /location-types` | any authenticated user |
| `GET /locations/:locationId` | any authenticated user |
| `POST /locations` | ADMIN |
| `PATCH /locations/:locationId` | ADMIN (body must include `version`) |
| `POST /locations/:locationId/deactivate` | ADMIN |
| `POST /locations/:locationId/restore` | ADMIN |

`GET /locations` returns `{ items, page, pageSize, total }` (20 per page by default). `order=asc` (default) sorts by name A→Z, `order=desc` gives Z→A. Errors are returned as Problem Details (`application/problem+json`).
