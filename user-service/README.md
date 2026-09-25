<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
Scope: Generated the run and test instructions for the User Service.
Author review: Read in full; checked against the team's work plan.
-->

# User Service

Accounts, credentials, sessions, profile management and the admin role lifecycle. **Design decisions are in [`AGENTS.md`](AGENTS.md)** — read that before changing anything here.

Stack: NestJS (TypeScript, Node.js), PostgreSQL via `pg` with plain parameterized SQL, Zod for validation. Redis and email arrive in later Phase 0 steps.

## Run it with Docker (recommended)

From the repo root:

```bash
cp .env.example .env      # fill in the USER_* secrets; the rest can stay empty for now
docker compose up --build
```

That starts four containers: `user-service` (port 3001), `user-db` (PostgreSQL 17), `user-redis` and `mailpit`. Migrations run automatically at startup.

| What | Where |
|---|---|
| The service | http://localhost:3001 |
| Health check | http://localhost:3001/health |
| Mailpit inbox (OTPs land here) | http://localhost:8025 |

`docker compose down` stops everything; the database survives, because it lives in a named volume. `docker compose down -v` deletes it too.

## Run it locally without Docker

You still need PostgreSQL. Point `USER_DATABASE_URL` at it in the repo-root `.env`:

```
USER_DATABASE_URL=postgres://foc:<password>@localhost:5432/users
```

Then, from `user-service/`:

```bash
npm install
npm run build
npm run migrate     # optional: the service also migrates on startup
npm run start:dev
```

`USER_PORT` defaults to 3001. Variables set in the real environment override the `.env` file, which is how compose points the service at the containers.

## Migrations

Schema changes are numbered SQL files in `migrations/`, applied in filename order and recorded in a `schema_migrations` table, so each runs exactly once per database.

To change the schema, **add a new file** (`002_….sql`) — never edit one that has been applied, because databases that already ran it will not run it again.

`AGENTS.md` explains why this service uses migrations where the Supplier Service creates its tables at startup.

## Tests

```bash
npm test
```

## What exists so far

Phase 0 step 1 only: the skeleton, configuration, the database connection and migrations, the error filter, the Zod validation pipe and the redacting logger. There are no authentication or user endpoints yet — `GET /health` is the only route. See the build order in `AGENTS.md`.
