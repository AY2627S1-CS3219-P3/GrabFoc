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
cp .env.example .env
```

Then generate the keys. Run this **once**, from the repo root — each line appends to `.env`:

```bash
{
  echo "USER_AES_KEY=$(openssl rand -base64 32)"
  echo "USER_EMAIL_HMAC_KEY=$(openssl rand -base64 32)"
  echo "USER_OTP_HMAC_KEY=$(openssl rand -base64 32)"
  echo "USER_JWT_PRIVATE_KEY=$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null | base64 | tr -d '\n')"
  echo "USER_JWT_KID=dev-$(date +%Y-%m)"
} >> .env
```

Check it worked — five lines, none of them empty:

```bash
grep -cE '^USER_(AES_KEY|EMAIL_HMAC_KEY|OTP_HMAC_KEY|JWT_PRIVATE_KEY|JWT_KID)=.+' .env
```

`.env` will now hold each of these twice: the empty placeholder from `.env.example` and the
generated value below it. That is fine — Node and Docker Compose both take the **last**
occurrence. Delete the empty ones if the duplication bothers you.

About these keys:

- The three 32-byte secrets must each be **different**. A separate key per purpose means
  compromising one does not compromise the others.
- `USER_JWT_PRIVATE_KEY` is an RS256 private key. Only the private half is configured; the
  public half is derived from it and published at `/.well-known/jwks.json`. It is
  base64-encoded onto one line because a raw PEM spans many lines, which `.env` and compose
  do not handle.
- **Never commit the PEM.** `*.pem` and `*.key` are git-ignored, but the safest thing is not
  to write it to a file at all — the command above pipes it straight into `.env`, which is
  also git-ignored.

Changing `USER_AES_KEY` later makes existing encrypted emails and mobile numbers
undecryptable, and changing `USER_EMAIL_HMAC_KEY` makes existing accounts unfindable, so in
development regenerate them together with the database.

```bash
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

The service validates its whole environment at startup, so **PostgreSQL, Redis and an SMTP
host must all be configured** — otherwise it exits with `Invalid environment` before
listening. The simplest route is to run just the dependencies in Docker and the service
on your machine:

```bash
docker compose up -d user-db user-redis mailpit
```

Then, in the repo-root `.env`:

```
USER_DATABASE_URL=postgres://foc:foc_dev_password@localhost:5432/users
USER_REDIS_URL=redis://localhost:6379
USER_SMTP_HOST=localhost
USER_SMTP_PORT=1025
```

(plus the keys from the previous section). If you are supplying your own PostgreSQL, Redis
or SMTP server instead, point these at those.

Then, from `user-service/`:

```bash
npm install
npm run build
npm run migrate     # optional: the service also migrates on startup
npm run start:dev
```

`USER_PORT` defaults to 3001. Variables set in the real environment override the `.env` file, which is how compose points the service at the containers.

### If the service cannot reach the database

If you already run PostgreSQL on your machine — Postgres.app, a Homebrew install, another
project's container — it owns `localhost:5432` and the compose container's published port
loses to it. The service then connects to the wrong server and exits with something like
`role "foc" does not exist`. Check with:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

Either stop the other server, or publish the container on a free port by adding
`- "55432:5432"` to `user-db` in `compose.yaml` and pointing `USER_DATABASE_URL` at
`localhost:55432`. `docker compose up` on its own is unaffected: inside the compose network
the service talks to `user-db` directly and never touches the host's port.

## Migrations

Schema changes are numbered SQL files in `migrations/`, applied in filename order and recorded in a `schema_migrations` table, so each runs exactly once per database.

To change the schema, **add a new file** (`002_….sql`) — never edit one that has been applied, because databases that already ran it will not run it again.

`AGENTS.md` explains why this service uses migrations where the Supplier Service creates its tables at startup.

## Tests

```bash
npm test          # unit tests, no containers needed
npm run test:int  # integration tests, needs Redis
```

`npm test` is offline and fast. The integration tests (`*.int.spec.ts`) run the OTP Lua
scripts against a real Redis, because their whole point is that Redis executes them
atomically — no in-memory fake reproduces that. Start Redis first:

```bash
docker compose up -d user-redis
```

## What exists so far

Phase 0 steps 1 to 4: the skeleton, configuration, the database and migrations, the error filter, the Zod pipe, the redacting logger, the crypto helpers in `src/crypto`, access tokens with RBAC in `src/auth`, and Redis-backed OTPs with email delivery in `src/otp` and `src/mail`.

Phase 0 step 4 adds Redis, `MailService` and `OtpService` on top.

Routes so far: `GET /health` and `GET /.well-known/jwks.json`, both public. There are still no register or login endpoints, so OTPs and tokens are exercised from tests only. See the build order in `AGENTS.md`.

Once an OTP is sent, read it at **http://localhost:8025** — Mailpit's inbox.

**Authentication is on by default.** `JwtAuthGuard` is registered globally, so every route needs a bearer token unless it is marked `@Public()`. Forgetting the decorator leaves an endpoint closed rather than open.
