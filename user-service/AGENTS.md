<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
Scope: Transcribed the team's User Service design (roles, storage, credential handling, token
       rules, OTP rules, endpoints, admin lifecycle) from the team's working plan into this file,
       following the structure of supplier-service/AGENTS.md. No design decisions were made by
       the AI: the choices recorded here, including RS256, the Postgres/Redis split, the schema
       and the endpoint shapes, were made by the team.
Author review: Read in full; checked against the team's work plan.
-->

# AGENTS.md — User Service

Service-specific context for `user-service/`. Read the root [`AGENTS.md`](../AGENTS.md) first: it has the product, terminology, roles, the auth model, cross-cutting rules, the plan-first rule and the **AI-agent rules** (warn before breaking them).

Status legend: **[Decided]** · **[Proposed]** · **[Open]** (defined in the root `AGENTS.md`).

**Scope for now:** credentials, sessions, profile management and the admin role lifecycle. Publishing a `UserRegistered` event (and the transactional outbox behind it), the suspend endpoint and login audit logs are deferred — see [Deferred](#deferred).

**Implementation [Decided]** · _Origin: Team_

- NestJS (TypeScript, Node.js), PostgreSQL through `pg` with plain parameterized SQL, strict Zod validation. Same stack as the Supplier Service.
- Redis for short-lived state, with AOF persistence (`everysec`).
- Mail goes through a `MailService` interface with one SMTP implementation (nodemailer). In development it points at a **Mailpit** container, a fake inbox at `localhost:8025`, so OTPs can be read without sending real email.
- **JSON field names are camelCase** (`userId`, `displayName`, `countryCode`, `mobileNumber`, `accessToken`, `expiresIn`); **database columns are snake_case** (`email_hash`, `password_hash`, `deactivated_at`). This differs from the Supplier Service, which mirrors its column names into its JSON — see [Open](#open).
- Environment variables are prefixed `USER_` and read from the repo-root `.env` (the Supplier Service's convention, see `supplier-service/src/config.ts`). The exception is `LOG_LEVEL`, which is shared across services and lives in the Global section of `.env.example`. Every variable must appear in the root `.env.example` with a safe placeholder.
- **Schema changes are migrations, not startup SQL.** Numbered files in `user-service/migrations/` applied in order by a small runner that records applied versions in a `schema_migrations` table. This is a deliberate divergence from the Supplier Service's startup `CREATE TABLE IF NOT EXISTS`, for two reasons: `CREATE TYPE` has no `IF NOT EXISTS` form (this service needs two enums), and `IF NOT EXISTS` silently skips a table that already exists in an *older* shape, so a column added later never appears on a teammate's database.
- **Cryptography lives in `src/crypto` and nowhere else.** Nothing outside it imports `crypto` directly or reads a key from config, so there is one place to review when the marking asks how credentials are protected.
- bcrypt is provided by `bcryptjs` (pure JavaScript) rather than the native `bcrypt`, which needs a compiler toolchain to build on Alpine. Slower per hash, but it installs identically on every teammate's machine and inside the Docker image. The cost factor is unaffected.
- Redis access goes through `ioredis`; mail through `nodemailer` behind the `MailService` interface, so tests inject a fake and the destination can change without touching feature code.
- **Tests are split.** `npm test` is unit-only and needs no containers. `npm run test:int` runs `*.int.spec.ts` against a real Redis, because the OTP Lua scripts are only meaningful when Redis executes them atomically (root `AGENTS.md` §3: database tests run against containers).
- Run and test instructions: `README.md`. Postman collection: `user-service/postman/`.

**Why PostgreSQL and Redis [Decided]** · _Origin: Team_

- **PostgreSQL for durable data.** User records are **structured** — every account has the same fields — and relational: refresh tokens reference users. Two requirements need a real transactional database: the last-admin check holds a row lock (`SELECT … FOR UPDATE`) across a read and a write, and `email_hash` needs a database-level `UNIQUE` constraint so two simultaneous sign-ups can't both succeed.
- **Redis for short-lived data.** Every value in [Redis keys](#redis-keys) has an expiry — an OTP lives 5 minutes, a lockout 15, a rate window 10. Expiry is native in Redis; in Postgres it would mean a timestamp column plus a cleanup job. These values are also **recoverable**: if Redis is lost, counters reset and in-flight OTPs are dropped, and users simply retry. Nothing that must survive is kept there.

**Credential and personal-data storage [Decided]** · _Origin: Team (Backlog U1.2.1–U1.2.3)_

| Data | Stored as | Why |
|---|---|---|
| Password | bcrypt, cost 12 (U1.2.1) | Salted and deliberately slow to verify |
| Email | AES-256-GCM in `email_encrypted` (U1.2.2) | Encrypted at rest; GCM also detects tampering |
| Mobile number | AES-256-GCM in `mobile_encrypted` (U1.2.3) | As above |
| Email, for lookup | keyed HMAC-SHA256 in `email_hash` | Encryption produces different bytes each time, so it can't be searched or made `UNIQUE`. The HMAC is deterministic, so it can be both. It is **keyed** rather than a plain SHA-256 so a leaked database can't be reversed by hashing a list of NUS email addresses. |
| OTP | keyed HMAC-SHA256 (`OTP_HMAC_KEY`, over `purpose + userId + code`) | Never stored in the clear. A plain hash of a 6-digit code is brute-forceable from a leak; the key prevents that. |
| Refresh token | SHA-256 in `token_hash` | The token itself is returned once and never stored |

- A **separate key per purpose** (`USER_AES_KEY`, `USER_EMAIL_HMAC_KEY`, `USER_OTP_HMAC_KEY`), all from environment variables, never committed.
- Emails are **normalised** (trimmed and lowercased) before validation, encryption and hashing. Without this, `Alex@u.nus.edu` and `alex@u.nus.edu` become two accounts.

**Tokens and RBAC [Decided]** · _Origin: Team (Backlog NFR5.3, U2.1.x, U2.2.1)_

- **Access token:** JWT, **RS256**, 15 minutes, claims `{ sub, role, iat, exp }`, `kid` in the header. The public key is served at `GET /.well-known/jwks.json`.
- **Why RS256 and not HS256:** HS256 uses one shared secret, which would have to sit in the environment of every service that verifies a token — meaning any of them (or anyone who reads their configuration) could *mint* an ADMIN token. With RS256 only the User Service holds the private key; everyone else holds the public key and can only verify (NFR5.3).
- **Refresh token:** 32 random bytes, returned once, valid 7 days, stored only as SHA-256. `POST /auth/refresh` runs in one transaction: revoke the presented token (`UPDATE … WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() RETURNING user_id`), **reload the user**, reject anyone not ACTIVE, then issue a new pair carrying the user's *current* role.
- Reloading on refresh is what makes demotion and deactivation take effect: a change lands within 15 minutes without any shared session store.
- **Token reuse:** presenting an already-revoked token is treated as theft — every refresh token for that user is revoked.
- **Revoke all** of a user's refresh tokens on password change, password reset and deactivation.
- **Enforcement:** `JwtAuthGuard` is registered **globally**, so every route requires a token unless marked `@Public()` — forgetting the decorator closes an endpoint rather than exposing one. `RolesGuard` reads `@Roles('ADMIN')` and returns 403; `@CurrentUser()` gives handlers the caller. **Identity comes from the verified token only** — never from the request body, a path parameter or an `X-User-Id` header (root `AGENTS.md` §8). Denials are logged once, centrally, by `ErrorFilter`, so no guard can forget to (U5.1.1, U5.2.2).
- `USER_JWT_PRIVATE_KEY` is a PKCS#8 PEM **base64-encoded onto one line**; a raw PEM spans many lines, which `.env` and compose do not handle. The public key is derived from it, not configured separately, so the pair cannot drift.

## Schema

_Origin: Team (tables, columns and types); field rules follow backlog U1.1.x and U1.2.x_

This is `migrations/001_init.sql`. A row in `users` exists only for a verified account or the bootstrap admin.

```sql
CREATE TYPE user_role   AS ENUM ('USER', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'DEACTIVATED', 'SUSPENDED');
-- Nothing sets SUSPENDED until the deferred status endpoint exists.

CREATE TABLE users (
    id                UUID         PRIMARY KEY,                  -- generated at register, before the row exists
    display_name      VARCHAR(100) NOT NULL,
    email_hash        CHAR(64)     NOT NULL UNIQUE,              -- HMAC-SHA256 of the normalised email (U1.1.3)
    email_encrypted   BYTEA        NOT NULL,                     -- AES-256-GCM: iv + tag + ciphertext (U1.2.2)
    country_code      VARCHAR(5),                                -- e.g. '+65'; NULL only for the bootstrap admin
    mobile_encrypted  BYTEA,                                     -- AES-256-GCM (U1.2.3); NULL only for the bootstrap admin
    password_hash     VARCHAR(100),                              -- bcrypt (U1.2.1); NULL only for the bootstrap admin before activation
    role              user_role    NOT NULL DEFAULT 'USER',
    status            user_status  NOT NULL DEFAULT 'ACTIVE',
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deactivated_at    TIMESTAMPTZ                                -- cleared on reactivation
);

CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id),
    token_hash  CHAR(64)    NOT NULL UNIQUE,                     -- SHA-256 of the token
    expires_at  TIMESTAMPTZ NOT NULL,                            -- created + 7 days
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
```

Note there is **no `otp_codes` table**. OTPs and pending sign-ups live in Redis, because both expire and neither needs to survive a restart.

## Redis keys

_Origin: Team_

| Key | Value | TTL | Purpose |
|---|---|---|---|
| `reg:{emailHash}` | JSON: userId, displayName, encrypted email and mobile, countryCode, passwordHash, otpHash, otpExpiresAt, attempts | 15 min | pending sign-up (no `users` row yet) |
| `otp:{purpose}:{userId}` | JSON: otpHash, attempts, and for `NEW_EMAIL_VERIFY` the encrypted new email | 5 min | the OTP for one action |
| `otpreq:{subject}` | counter | 10 min | OTP requests made |
| `otpblock:{subject}` | flag | 15 min | request block; remaining TTL becomes `retryAfterSeconds` |
| `loginfail:{emailHash}` | counter | 15 min | consecutive failed logins |
| `loginlock:{emailHash}` | flag | 15 min | lockout; remaining TTL becomes `retryAfterSeconds` |

- **`purpose`** is one of `REGISTRATION` (kept inside `reg:`), `PASSWORD_RESET`, `EMAIL_CHANGE`, `NEW_EMAIL_VERIFY`, `MOBILE_CHANGE`, `PASSWORD_CHANGE`, `DEACTIVATION`.
- **`subject`** is the `emailHash` for register, resend and forgot-password; the `userId` for `POST /users/me/otp`.
- Keys are built from the `emailHash`, never the plaintext email, so a known and an unknown address behave identically and nothing leaks by timing or key inspection.
- Issuing a new OTP **overwrites** the key, so the previous code stops working.
- **Verification is one Lua script.** It compares the stored hash against the hash of the submitted code, increments `attempts` on a mismatch, deletes the key on the third wrong try, and deletes it on success. These must be atomic: as three separate commands, two parallel requests can interleave and grant more than three attempts. A wrong guess re-writes the key with `KEEPTTL`, so guessing cannot extend a code's five-minute life.
- **The request limit is also one Lua script**, for the same reason: reading the counter and deciding to block are separate steps, so three simultaneous requests could each see a count below the limit. Only the first request in a window sets the expiry, so the window cannot slide forward indefinitely.

## Rules

_Origin: Team (Backlog USFR1–6, NFR5.1 and team decisions)_

**Input**

- Email must be a valid address on `u.nus.edu` or `nus.edu.sg`, normalised first (U1.1.1, U2.1.1).
- An email already attached to any account — including DEACTIVATED and SUSPENDED — is rejected with 409 `EMAIL_TAKEN` (U1.1.3).
- Password: 8–128 characters, at least one uppercase, one lowercase and one digit (U1.1.4, U3.2.2).
- Mobile number: validated with libphonenumber-js against the given country code, digits only (U1.1.5, U3.1.3).
- Every request body is validated by a **strict** Zod schema; unknown fields are rejected with 400, not ignored (root `AGENTS.md` §8). This is what prevents a caller adding `"role": "ADMIN"` to a profile update.

**OTP**

6 digits, valid 5 minutes, dies after 3 wrong tries, single use, and a newer code replaces an older one. At most **3 requests per 10 minutes per subject**; the 4th starts a 15-minute block (429 `RATE_LIMITED` with `retryAfterSeconds`). Every OTP sent counts, including the second one in an email change. All OTPs are delivered by email (U2.3.2).

| Action | OTPs |
|---|---|
| Sign up | 1, to the new email |
| Log in, refresh, log out, change display name | 0 |
| Forgot/reset password, change password, change mobile, deactivate | 1, to the account email |
| Change email | 2 — first to the current email, then to the new one (U3.1.1, U3.1.2) |
| Admin role change, admin reactivation | 0 — the ADMIN role is checked instead |

The OTP is **submitted together with the action**, never verified in a separate call. A separate `/otp/verify` would mean the server had to remember "this user is verified" and leave a gap between the two requests.

**Login** (U2.1.2, U2.1.3, U2.3.1)

1. If `loginlock:{emailHash}` exists → 423 `ACCOUNT_LOCKED` with `retryAfterSeconds`.
2. Unknown email → compare the supplied password against a **dummy bcrypt hash**, so the response time and the 401 are identical to a wrong password. A NULL `password_hash` (bootstrap admin, not yet activated) counts as a wrong password.
3. Wrong password → increment `loginfail`. The 5th failure sets the lock and returns 423; earlier failures return 401 `INVALID_CREDENTIALS`.
4. Correct password → clear the counter, then reject DEACTIVATED (403 `ACCOUNT_DEACTIVATED`) and SUSPENDED (403 `ACCOUNT_SUSPENDED`).

Account status is revealed **only after a correct password**, so the endpoint can't be used to enumerate accounts.

**Register and verify**

- `POST /auth/register` writes a pending sign-up to Redis and creates **no** `users` row (U1.1.2). Registering again for the same email overwrites the pending entry.
- `POST /auth/register/verify` inserts the user with `ON CONFLICT (email_hash) DO NOTHING`, so a double submit is safe, then deletes the Redis key.

**Forgot and reset password**

- `POST /auth/password/forgot` always returns the same 202 and the same message, whether or not the account exists. An OTP is sent only if the account exists and is ACTIVE.
- `POST /auth/password/reset` returns the same `OTP_INVALID` for an unknown email as for a wrong code.
- A new password that matches the current one is rejected (skipped when the current hash is NULL).

**Requester / courier mode (USFR6)**

A **UI-only** toggle. Every USER may both request and deliver; the backend never authorises on mode. Protection comes from the role plus ownership checks inside each service — for example the Order Service rejects a courier accepting their own order (O2.2.1).

**Logging** (U5.1.1, U5.2.2, NFR5.1)

- Never log passwords, tokens, OTPs, email addresses or mobile numbers. The logger redacts these fields.
- Structured events: `UNAUTHORISED_ACCESS` `{userId, method, path, timestamp}`, `ADMIN_ACTION` `{actorId, targetId, action, from, to, timestamp}`, `ADMIN_BOOTSTRAPPED` `{userId, timestamp}`.
- Admin actions are logged **after** the transaction commits.

## API

_Origin: Team_

**Auth response:** `{ accessToken, refreshToken, expiresIn: 900, user: { userId, displayName, role } }`

**Profile:** `{ userId, displayName, email, countryCode, mobileNumber, role, status, createdAt }`

### Public

| Endpoint | Body → Response | Main errors |
|---|---|---|
| `POST /auth/register` | displayName, email, countryCode, mobileNumber, password → 201 `{ userId, otpExpiresAt }` | 400, 409 `EMAIL_TAKEN`, 429, 503 |
| `POST /auth/register/verify` | email, otp → 200 auth response | OTP errors, 404 |
| `POST /auth/register/resend-otp` | email → 202 `{ otpExpiresAt }` | 404, 429, 503 |
| `POST /auth/login` | email, password → 200 auth response | 401, 403, 423 |
| `POST /auth/refresh` | refreshToken → 200 `{ accessToken, refreshToken, expiresIn }` | 401 |
| `POST /auth/password/forgot` | email → 202, always the same message | 429 |
| `POST /auth/password/reset` | email, otp, newPassword → 204 | OTP errors, 400 |
| `GET /.well-known/jwks.json` | → 200 `{ keys: [...] }` | |

### Logged in (USER or ADMIN)

| Endpoint | Body → Response | Main errors |
|---|---|---|
| `POST /auth/logout` | refreshToken → 204 | |
| `GET /users/me` | → profile | |
| `PATCH /users/me` | displayName → profile (any other field → 400) | 400 |
| `POST /users/me/otp` | purpose (`EMAIL_CHANGE`, `MOBILE_CHANGE`, `PASSWORD_CHANGE`, `DEACTIVATION`) → 202 `{ otpExpiresAt }` | 400, 409 `LAST_ADMIN` (DEACTIVATION only), 429, 503 |
| `POST /users/me/email` | newEmail, otp → 202; sends an OTP to the new address | OTP errors, 409 `EMAIL_TAKEN`, 429 |
| `POST /users/me/email/verify` | otp → profile | OTP errors, 409 |
| `PATCH /users/me/mobile` | countryCode, mobileNumber, otp → profile | OTP errors, 400 |
| `POST /users/me/password` | otp, newPassword → 204 | OTP errors, 400 |
| `POST /users/me/deactivate` | otp → 204 | OTP errors, 409 `LAST_ADMIN` |
| `GET /users/:userId` | → profile; only the user themselves or an ADMIN | 403 + log, 404 |

`/users/me*` always resolves the caller from the token's `sub` (U5.2.1).

### Admin only

| Endpoint | Body → Response | Main errors |
|---|---|---|
| `GET /admin/users` | query: page, pageSize, role, status, email (exact, matched via hash) → `{ items, page, pageSize, total }` | 403 + log |
| `PATCH /admin/users/:userId/role` | role → profile | 403, 404, 409 `CANNOT_MODIFY_SELF`, 409 `USER_NOT_ACTIVE`, 409 `LAST_ADMIN` |
| `POST /admin/users/:userId/reactivate` | (no body) → profile | 403, 404, 409 `NOT_DEACTIVATED` |

### Internal — never routed through the gateway

| Endpoint | Body → Response | Main errors |
|---|---|---|
| `GET /internal/users/:userId` | header `X-Service-Key`, compared with `timingSafeEqual` → `{ userId, displayName, email, status }` | 401, 404 |

### Errors

| Status | When |
|---|---|
| **400** | `VALIDATION_ERROR` (with the failing fields); `OTP_INVALID` (with `attemptsRemaining`); `OTP_EXPIRED` — a missing or used-up code counts as expired |
| **401** | Missing, invalid or expired token; `INVALID_CREDENTIALS` on login |
| **403** | Wrong role (logged, U5.1.1); not the owner (logged, U5.2.2); `ACCOUNT_DEACTIVATED`; `ACCOUNT_SUSPENDED` |
| **404** | No such user or pending sign-up |
| **409** | `EMAIL_TAKEN`, `LAST_ADMIN`, `CANNOT_MODIFY_SELF`, `USER_NOT_ACTIVE`, `NOT_DEACTIVATED` |
| **423** | `ACCOUNT_LOCKED`, with `retryAfterSeconds` |
| **429** | `RATE_LIMITED`, with `retryAfterSeconds` |
| **503** | `SERVICE_UNAVAILABLE` — mail failed after one retry (5 s timeout) |

**Error body [Open].** This service's plan uses `{ "error": { "code", "message", "details" } }`; the Supplier Service returns RFC 9457 Problem Details as `application/problem+json`. The two must be reconciled before either ships — see [Open](#open). Whichever envelope wins, the requirement is a **stable machine-readable `code`** plus room for `attemptsRemaining`, `retryAfterSeconds` and per-field validation errors, because the frontend must distinguish `OTP_INVALID` from `OTP_EXPIRED` from `LAST_ADMIN`. **The frontend switches on the code, never on the human-readable message.**

The service must be usable through Postman without the UI running. Keep a collection in `user-service/postman/`, using Postman variables (`{{baseUrl}}`, `{{accessToken}}`); never commit real tokens or passwords.

## Roles and admin lifecycle

_Origin: Team (Backlog USFR5); role capabilities are in root `AGENTS.md` §5_

| Role | Can do |
|---|---|
| USER | Manage their own profile; all requester and courier actions in the other services |
| ADMIN | Everything a USER can, plus location create/update/deactivate/restore in the Supplier Service, and `/admin/**` here |

### First admin

1. The deployment sets `USER_BOOTSTRAP_ADMIN_EMAIL`.
2. On startup, **only if the `users` table is empty**, insert that address as ADMIN, ACTIVE, `password_hash = NULL`, and log `ADMIN_BOOTSTRAPPED`. Otherwise do nothing — so changing the variable later can never add an admin.
3. That person uses "forgot password": the OTP goes to their inbox and they set a password, which is checked against the normal policy.

Why this rather than an `ADMIN_PASSWORD` environment variable: no secret sits in configuration, only the owner of that inbox can claim the account, and the password follows the same policy as everyone else's.

Note: if anyone registers before the service first starts with the variable set, the bootstrap never runs. Set it before the first deploy; in development, wipe the database.

### Promotion

An ADMIN calls `PATCH /admin/users/:userId/role` with `{ "role": "ADMIN" }`. The target must be ACTIVE (otherwise 409 `USER_NOT_ACTIVE`), and the change is logged as `ADMIN_ACTION`. It takes effect at the target's next refresh, within 15 minutes, because refresh reloads the role. **No developer intervention is needed for a promotion** (D2 asks for this explicitly).

### Deactivation and reactivation

- **A user deactivates themselves:** `POST /users/me/otp` with `DEACTIVATION`, then `POST /users/me/deactivate` (U4.1.1). Sets `status = DEACTIVATED` and `deactivated_at`, revokes all refresh tokens, keeps the row. The email stays taken, so re-registering returns 409. Logging in returns 403 `ACCOUNT_DEACTIVATED`.
- **Only an admin can reactivate:** `POST /admin/users/:userId/reactivate`. Only for DEACTIVATED accounts — anything else is 409 `NOT_DEACTIVATED`. Sets ACTIVE, clears `deactivated_at`, logs `ADMIN_ACTION`. The user logs in with their old password. The role is kept, so a reactivated admin is an active admin again. Admins find the account with `GET /admin/users?status=DEACTIVATED&email=…`.
- **The sole admin cannot deactivate** → 409 `LAST_ADMIN`. With zero admins nobody could edit locations, promote users or reactivate accounts, and the bootstrap will not run again because `users` is not empty — so recovery would need someone editing the database by hand, which is exactly the manual intervention D2 asks us to avoid. The admin should promote someone else first. Checked **twice**: when the DEACTIVATION OTP is requested, so no OTP is wasted, and again inside the locked transaction below.

### The last-admin lock

An admin may not demote themselves (409 `CANNOT_MODIFY_SELF` — another admin must do it), and no change may leave zero ACTIVE admins (409 `LAST_ADMIN`).

Two admins demoting each other at the same moment would both pass a naive `count(*) > 1` check and leave zero admins. The check and the change therefore run in **one transaction**:

```sql
BEGIN;
SELECT id FROM users
WHERE role = 'ADMIN' AND status = 'ACTIVE'
ORDER BY id
FOR UPDATE;          -- a second request waits here until the first commits

-- then, in code, using the locked list:
--   caller not in the list          → 403 (they lost admin; their token is stale)
--   caller = target                 → 409 CANNOT_MODIFY_SELF   (role endpoint only)
--   no admins left after the change → 409 LAST_ADMIN

UPDATE users SET role = 'USER', updated_at = now() WHERE id = $target;
-- self-deactivate instead: SET status = 'DEACTIVATED', deactivated_at = now() WHERE id = $caller
COMMIT;
```

- Postgres does not allow `count(*)` together with `FOR UPDATE`, so select the ids and count them in code.
- `ORDER BY id` makes every request lock rows in the same order, so two requests cannot deadlock.
- Keep the transaction short; log after the commit.
- One helper serves both the role change and the self-deactivate path. A non-admin deactivating does not need the lock.
- The caller's role is re-read from the database inside the lock, so a 15-minute-old ADMIN token cannot act on stale authority.

## Integration

_Origin: Team; see root `AGENTS.md` §6_

| With | Agreement |
|---|---|
| API Gateway | Route `/auth/**`, `/users/**`, `/admin/**` and `/.well-known/jwks.json` here. **Block `/internal/**`.** Forward the `Authorization` header unchanged. |
| Every service | Verify the JWT itself against the JWKS, caching keys by `kid`. Use `sub` as the user id and `role` for RBAC. Never trust an identity header sent by the client (e.g. `X-User-Id`). |
| Supplier Service | This replaces the **DEV-ONLY** `X-User-Id` / `X-User-Role` guard in `supplier-service/src/common/auth.ts`. Admin routes need `role = ADMIN`: no token → 401, USER → 403, ADMIN → 200. That is the D2 integration demo. |
| Credit Service | Needs one account per user (CSFR1.1). Until `UserRegistered` exists, create it lazily and idempotently on first use (`INSERT … ON CONFLICT DO NOTHING`, 10 credits). |
| Notification Service | Events carry only ids (N2.1.1), so it calls `GET /internal/users/:userId` for the email address. |
| Frontend | Refresh **one request at a time** — two parallel refreshes look like token reuse and will log the user out. On 403 `ACCOUNT_DEACTIVATED`, show "contact an admin". |

Send the JWKS URL and the exact claim shape to the gateway and Supplier owners in week 1; both are blocked without them.

## Configuration

_Origin: Team_

All prefixed `USER_` except the shared `LOG_LEVEL`. All are listed in the root `.env.example` with placeholders; real values live only in the git-ignored `.env`.

`LOG_LEVEL` · `USER_PORT` · `USER_DATABASE_URL` · `USER_REDIS_URL` · `USER_JWT_PRIVATE_KEY` (PEM) · `USER_JWT_KID` · `USER_AES_KEY` (32 bytes) · `USER_EMAIL_HMAC_KEY` · `USER_OTP_HMAC_KEY` · `USER_SMTP_HOST` · `USER_SMTP_PORT` · `USER_SMTP_USER` · `USER_SMTP_PASS` · `USER_SMTP_FROM` · `USER_BOOTSTRAP_ADMIN_EMAIL` · `USER_INTERNAL_SERVICE_KEY`

## Open

- **Error body format across services.** This service plans `{ error: { code, message, details } }`; Supplier already returns RFC 9457 Problem Details with no machine-readable code field. Needs the User, Supplier, gateway and frontend owners. Supplier's own `AGENTS.md` lists a related open item ("whether error responses add an `errors` extension"), so raise it there.
- **JSON field naming.** camelCase here, snake_case in Supplier. camelCase is the usual convention for a Node/Nest API (and the database columns stay snake_case either way), but the frontend will consume both, so the team should agree one style.
- **OTP length in the mockup** — the UI mockup shows a different number of digits; this service uses 6 (root `AGENTS.md` §10).
- **Lockout threshold** — 3 or 5 failures; this service uses 5 (root `AGENTS.md` §10).
- **Frontend token storage** — where the access and refresh tokens are kept.
- **SMTP provider** for real mail. Test delivery to `@u.nus.edu` early; Mailpit only proves the service sends.
- **Message broker** — blocks the outbox and `UserRegistered`.
- **Person A / Person B split** for the build order.
- These files have not been checked against `project.md`. Three things differ from it: `ACCOUNT_NOT_VERIFIED` removed, the `PENDING_VERIFICATION` status removed, `SUSPENDED` added.

## Edge cases

- **Last-admin race** — two admins demoting each other at once, or the last two both deactivating. Handled by the locked transaction above. Demo it with two `psql` sessions and show the second one waiting.
- **Double verify** — a repeated `POST /auth/register/verify` inserts nothing, thanks to `ON CONFLICT (email_hash) DO NOTHING`.
- **Two browser tabs refreshing at once** — the second presents an already-revoked token, which is indistinguishable from theft, so the user is logged out. The frontend must serialise refreshes.
- **Bootstrap never runs** if anyone registers before the service first starts with `USER_BOOTSTRAP_ADMIN_EMAIL` set.
- **A stale ADMIN token** stays valid for up to 15 minutes after a demotion. Admin endpoints re-read the role from the database inside the lock, so it cannot be used to change roles.
- **Redis data loss** resets counters and drops in-flight OTPs and pending sign-ups. Users retry; AOF `everysec` keeps this rare.
- **Account enumeration via register** — 409 `EMAIL_TAKEN` reveals that an address has an account. U1.1.3 requires the check, so this is accepted. Login, forgot-password and reset deliberately do *not* leak it.
- **Lockout as griefing** — anyone can lock another person out for 15 minutes by typing wrong passwords against their email. Accepted; it is the standard trade-off for a lockout policy.
- **Mail is slow or down** — one retry with a 5 s timeout, then 503. The pending sign-up or OTP still exists, so the user can resend.

## D2 demo checklist

_Origin: Team; rubric restated from `CS3219-Instructions-MilestoneD2.pdf`_

- [ ] Register → OTP appears in Mailpit → verified and logged in
- [ ] Lockout after 5 wrong passwords
- [ ] Supplier location edit: no token → 401, USER → 403, ADMIN → 200
- [ ] A profile change protected by an OTP (e.g. password)
- [ ] First admin: environment variable → forgot password → logged in as admin
- [ ] Promote a USER to ADMIN through the API; an admin cannot demote themselves
- [ ] The sole admin tries to deactivate → 409; after promoting a second admin it succeeds
- [ ] A user deactivates → login gives 403 → an admin reactivates → login works
- [ ] Last-admin race shown with two `psql` sessions
- [ ] Be ready to explain: why Postgres and Redis, the schema, encryption plus `email_hash`, RS256 over HS256, and the UI-only mode toggle

## Deferred

_Origin: Team_

- **Transactional outbox and `UserRegistered`.** An `outbox_events` table (`event_id`, `aggregate_id`, `event_type`, `payload` JSONB, `created_at`, `published_at`), written in the same transaction as the user insert in `/auth/register/verify`; a relay publishes to `user.events` keyed by `userId` and sets `published_at` after the broker acknowledges. Credit Service would consume it instead of creating accounts lazily. Blocked on the broker choice — until then, an `EventPublisher` interface with a no-op implementation.
- **`PATCH /admin/users/:userId/status`** for ACTIVE ↔ SUSPENDED, using the same last-admin lock and revoking refresh tokens on suspend. The `SUSPENDED` enum value exists but nothing sets it.
- **Login audit logs** (admin dashboard N2H).
