# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Read that first: it holds every confirmed design decision, the schema, the Redis key
layout, the full API and error-code table, and the rules AI agents must follow in this
repo (warn before touching architecture, schemas, interfaces or security trade-offs, and
attribute every AI-assisted change). This file only adds what `AGENTS.md` doesn't: exact
commands and the code-level wiring you'd otherwise have to reconstruct by reading half a
dozen files.

## Commands

Run from `user-service/`.

```bash
npm run build        # nest build -> dist/
npm run start:dev    # watch mode (nest start --watch)
npm run migrate      # applies migrations/*.sql manually (dist/db/migrate-cli.js); the
                      # service also does this automatically at startup
npm test             # unit tests only, no containers needed
npm run test:int     # *.int.spec.ts only — needs a real Redis:
                      #   docker compose up -d user-redis
```

Single test file: `npx jest <substring of the path>`, e.g. `npx jest login.service.spec`.
For a single integration test: `npm run test:int -- -t "<test name>"`.

The service validates its **entire** environment eagerly at import time (`src/config.ts`),
so both `npm test` and `npm run start:dev` need every `USER_*` variable set — unit tests get
a throwaway RS256 key pair from `src/test/env.setup.ts` (a Jest `setupFiles` entry), never a
real one.

Whole stack (from the repo root, not this directory):

```bash
cp .env.example .env
docker compose up --build     # user-service:3001, user-db (postgres:17), user-redis, mailpit:8025
```

See `README.md` for generating the required keys and setting `USER_BOOTSTRAP_ADMIN_EMAIL`
before first boot — both are one-time setup steps, not something to redo per session.

## Architecture

**Config is a single eager Zod parse, not a service.** `src/config.ts` loads the repo-root
`.env`, validates every `USER_*` variable with `EnvSchema.safeParse`, and throws at import
time if anything is missing or malformed — before Nest even starts wiring modules. Adding a
new required variable here means it must also land in `src/test/env.setup.ts` (unit tests)
and the repo-root `.env.example`, or the service/tests stop booting entirely instead of
failing where the variable is used.

**Everything cryptographic goes through one barrel.** `src/crypto/index.ts` re-exports the
only functions allowed to touch key material or Node's `crypto` module (email
normalize/hash, password hash/verify, AES encrypt/decrypt, token/OTP generation and
hashing). `src/auth/jwt.service.ts` is the one other file allowed to read a signing key. No
other file should import `crypto` or read a key off `config` — grading explicitly checks
this boundary (see `AGENTS.md`, "Cryptography lives in exactly two places").

**Every thrown error funnels through one filter.** Feature code throws `AppError` (`src/
common/app-error.ts`), never a bare `HttpException`. The global `ErrorFilter` (`src/common/
error.filter.ts`, registered in `main.ts`) is the only place that builds the `{ error: {
code, message, details } }` response body, and the only place that logs `UNAUTHORISED_ACCESS`
for every 401/403 — so a new guard should just throw, never log a denial itself. Error codes
are a closed enum in `src/common/error-codes.ts`; adding one is an interface change (warn
first, per `AGENTS.md`'s AI-agent rules).

**Auth is two global `APP_GUARD`s, order-dependent.** `AuthModule` registers `JwtAuthGuard`
then `RolesGuard` as global guards — in that order, because `RolesGuard` reads the `caller`
that `JwtAuthGuard` attaches to the request. Every route is closed by default; `@Public()`
(`src/auth/decorators.ts`) is the only opt-out, `@Roles(...)` restricts further, and
`@CurrentUser()` is the only sanctioned way for a handler to learn who is calling — never a
body field or path param.

**Database access is a raw `pg.Pool`, no ORM.** `DatabaseModule` (`src/db/database.ts`) is
`@Global` and exports a single `PG_POOL` token; each `*.repository.ts` hand-writes
parameterized SQL against it. `withTransaction(pool, fn)` is the only sanctioned way to run
multi-statement work on one client — required for anything needing `SELECT … FOR UPDATE`
(the last-admin lock in the role/deactivation flows). Migrations (`migrations/*.sql`) are
applied automatically on `DatabaseLifecycle.onModuleInit`, in filename order, under a
Postgres advisory lock, tracked in `schema_migrations` — never edit an already-applied file,
add a new numbered one.

**The admin bootstrap has no caller.** `AdminBootstrapService` (`src/users/
admin-bootstrap.service.ts`) is provided but not exported from `UsersModule`; nothing calls
it directly. It runs itself once from Nest's `onApplicationBootstrap` hook — deliberately
after `DatabaseLifecycle.onModuleInit` (migrations must have created `users` first) and
before `app.listen()` (so no request is ever served before it's had a chance to run).

**OTP/lockout correctness lives in Lua, not application code.** `src/auth/lockout.scripts.ts`
and `src/otp/otp.scripts.ts` implement the attempt-counting and rate-limiting as atomic Redis
Lua scripts, because the invariants (three attempts, then delete; three requests, then block)
break under concurrent requests if done as separate Redis commands. This is why `test:int` is
a separate Jest run from `test`: these scripts are meaningless against an in-memory fake and
need a real Redis.

**Module scoping is coarse on purpose.** `AuthModule`, `OtpModule`, `UsersModule`,
`DatabaseModule` and `RedisModule` are all `@Global()` — there's one `users` table shared by
the credentials/session code and the profile/admin code, and one small set of infrastructure
clients, so nothing here is feature-scoped the way a larger service might be.
