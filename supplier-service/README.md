<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
Scope: Generated run and test instructions for the Supplier Service.
Author review: pending — to be completed by the reviewing team member.
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

**Auth is DEV-ONLY for now:** every request needs `X-User-Id` (any value) and `X-User-Role` (`ADMIN` or `USER`). Missing or invalid → 401. This is temporary until the team decides how identity reaches the Supplier Service.

## Endpoints

| Method & path | Access |
|---|---|
| `GET /locations?name=&type=&building=&time=&includeInactive=&page=&pageSize=` | any authenticated user; `includeInactive=true` is ADMIN only |
| `GET /location-types` | any authenticated user |
| `GET /locations/:locationId` | any authenticated user |
| `POST /locations` | ADMIN |
| `PATCH /locations/:locationId` | ADMIN (body must include `version`) |
| `POST /locations/:locationId/deactivate` | ADMIN |
| `POST /locations/:locationId/restore` | ADMIN |

`GET /locations` returns `{ items, page, pageSize, total }` (20 per page by default). Errors are returned as Problem Details (`application/problem+json`).
