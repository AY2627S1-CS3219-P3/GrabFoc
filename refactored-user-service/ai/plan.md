<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: Wrote this restructure plan from the clarification session with Deanson (sections 1-4). Later the same day: updated the Module system row (nodenext instead of node, see the usage log).
Author review: Reviewed by Deanson
-->

# Plan: restructure `user-service` → `refactored-user-service`

## Context
`refactored-user-service/ai/instructions.md` asks for the old NestJS `user-service` to be restructured into a cleaner layout: InfraModule, SecurityModule, AuthModule and UsersModule, with plain files in `common/`. Business logic stays as the old code has it (the source of truth), simplified where agreed (KISS beats a 1:1 port). `refactored-user-service` will later be renamed to `user-service`, replacing the old folder, so its Docker/compose files must be drop-in compatible. All four clarification sections were settled with Deanson on 2026-10-16. Nothing is implemented until this plan is approved.

**Done when:** `npm run build` passes, `docker compose up` boots, migrations apply, and `GET /health` returns OK. The Postman collection is also ported and checked against the new rules.

## Decisions (summary)
| # | Decision |
|---|---|
| Module system | Switch the refactor to **CommonJS**: remove `"type":"module"`, set tsconfig to `module: nodenext` / `moduleResolution: nodenext` (emits CommonJS without `"type":"module"`; TS 6 rejects the planned `moduleResolution: node` as deprecated, changed 2026-10-16), drop the `.js` import suffixes, no top-level `await` in main.ts. |
| Guard | One global `common/guards/auth.guard.ts` (`AuthGuard`): `@Public` → skip; no Bearer → 401; `TokensService.verifyAccessToken` → 401; set `req.user = {id, role}`; `@Roles` → 403. |
| Roles | `Role { USER='USER', ADMIN='ADMIN' }`. Also `UserStatus` in `common/enums/`. |
| Mail | `MailService` only (ported `SmtpMailService`): synchronous nodemailer send, 1 retry, then 503. **No `mail.processor.ts`** (create it only when BullMQ is adopted). BullMQ is an open note. |
| Errors | Port `AppError`, `ErrorCode`, `ErrorFilter` → `common/errors/`. The filter maps nestjs-zod errors to `400 VALIDATION_ERROR` with `details.fields:[{field,message}]`. Response shape unchanged. |
| Schema | `001_init.sql` unchanged (unique `email_hash` only). |
| Redis | `RedisService` is the only class that touches Redis. 3 Lua scripts: `VERIFY_OTP` (with a consume flag), `HIT_LIMIT` (shared by the OTP request cap and the login lockout), `REPLACE_OTP_CODE`. One OTP record shape `{otpHash, attempts, otpExpiresAt, data?}`; pending sign-up key `otp:REGISTRATION:{emailHash}` (15 min). Ping/quit in `onModuleInit/onModuleDestroy`. |
| OTP rules | All 7 purposes. Old limits: 5-min code, 3 attempts, 3 requests per 10 min then a 15-min block; login 5 failures / 15 min → 15-min lock. |
| Crypto | All crypto helpers (email HMAC, AES-GCM, bcrypt, dummy hash, `generateId`, OTP generate/hash) live in `security/otp.service.ts`. No `verify(storedHash)`; the comparison stays in Lua. `hashEmail` doesn't normalise (DTOs do). |
| Config | `@nestjs/config` `ConfigModule.forRoot({isGlobal, validate})` with `src/config/env.validation.ts`, the old Zod schema returning decoded keys. Keep the `USER_*` env names. |
| Routes | Every old route, unchanged. `/auth/*` → `auth.controller`; `/users/me*` → `users.controller`; `/admin/users*` → `users-admin.controller`; `/.well-known/jwks.json` + `/health` → `src/utils/`. |
| Status checks | Login 403, refresh 401, forgot/reset ACTIVE-only: all in `AuthService`. 15-min stale-token window accepted, **but** `reactivate` re-checks in the DB that the caller is an ACTIVE ADMIN. |
| Transactions | `AuthService` owns `db.transaction` for register/verify and refresh, passing `tx` to UsersService and TokensService. Refresh returns an outcome from the transaction and throws only after commit (so the reuse revoke persists). |
| Users internals | Admin lock → private `withAdminLock` in UsersService; bootstrap → `UsersService.onApplicationBootstrap`; profile mapping → private `toSelfProfile/toAdminProfile` + `users/dto/profile.response.ts`. |
| DTOs | Always in each module's `dto/`; shared field rules only in `common/validation/fields.ts`. Users: UpdateProfile, RequestOtp, ChangeEmail, Otp (email/verify + deactivate), ChangeMobile, ChangePassword, ChangeRole, ListUsersQuery. |
| Migrations | `db/migrations/001_init.sql`; migrator path `path.resolve(__dirname,'../../../db/migrations')`. `DatabaseLifecycle` in `infra/database/database.lifecycle.ts`, listed in InfraModule `providers` (not exported). Keep `migrate-cli.ts` + `npm run migrate` (path → `dist/infra/database/migrate-cli.js`). |
| Docker | `Dockerfile` + `compose.yaml` mirroring the old ones (same service names `user-service`, `user-db`, `user-redis`, `mailpit`, ports, `name: foc`, explicit env list) so they drop in after the rename. Changed 2026-10-16 during step 5: base image `node:24-alpine` (npm 11, matching the lock file; npm 10 in node:22 rejects it with `npm ci`). |

## Target tree
```
refactored-user-service/
├── Dockerfile  .dockerignore  compose.yaml
├── db/migrations/001_init.sql
├── postman/user-service.postman_collection.json
├── ai/{instructions.md (updated), open_decisions.md (new), usage-log.md (+entry)}
└── src/
    ├── main.ts  app.module.ts
    ├── config/env.validation.ts
    ├── common/{guards/auth.guard.ts, decorators/{public,roles,current-user}.decorator.ts,
    │           enums/{role,user-status}.enum.ts, types/auth-user.ts, validation/fields.ts,
    │           errors/{app-error,error-codes,error.filter}.ts, logging/logger.ts}
    ├── utils/{jwks,health}.controller.ts
    ├── infra/{infra.module.ts,
    │          database/{pg-pool.provider,database.service,database.lifecycle,migrator,migrate-cli}.ts,
    │          redis/{redis.provider,redis.constants,redis.scripts,redis.service}.ts,
    │          mail/mail.service.ts}
    ├── security/{security.module,otp.service,tokens.service,refresh-tokens.repository}.ts
    ├── auth/{auth.module,auth.controller,auth.service}.ts + dto/ (existing 7)
    └── users/{users.module,users.controller,users-admin.controller,users.service,users.repository}.ts
              + dto/ (8 DTOs + profile.response.ts)
```
Module wiring: AppModule imports ConfigModule, InfraModule (`@Global`; exports only DatabaseService, RedisService, MailService), SecurityModule (JwtModule RS256; exports only OtpService, TokensService), AuthModule (→ UsersModule, SecurityModule), UsersModule (→ SecurityModule; exports only UsersService). AppModule provides `APP_GUARD AuthGuard`, `APP_PIPE ZodValidationPipe` (nestjs-zod), and controllers `JwksController`, `HealthController`. main.ts: `useGlobalFilters(new ErrorFilter())`, `RedactingLogger`, `enableShutdownHooks`, port from ConfigService.

## Old → new mapping (source: `user-service/`)
| Old | New |
|---|---|
| `src/main.ts`, `app.module.ts` | same names (rewired) |
| `src/config.ts` | `src/config/env.validation.ts` |
| `src/db/database.ts` | `infra/database/pg-pool.provider.ts` (`PG_POOL`), `database.service.ts` (`query`, `transaction` ← `withTransaction`), `database.lifecycle.ts` |
| `src/db/migrator.ts`, `migrate-cli.ts` | `infra/database/` (path updated; the CLI parses env with the same schema) |
| `migrations/001_init.sql` | `db/migrations/001_init.sql` |
| `src/redis/redis.module.ts` | `infra/redis/redis.provider.ts` (`REDIS_CLIENT`) + lifecycle in RedisService |
| `otp/otp.scripts.ts`, `auth/lockout.scripts.ts` | `infra/redis/redis.scripts.ts` (5 → 3) |
| constants/keys from otp, lockout, registration services | `infra/redis/redis.constants.ts` (+ `OtpPurpose`) |
| Redis calls in `otp.service.ts`, `lockout.service.ts` | `infra/redis/redis.service.ts` (8 methods) |
| OTP issue/verify flow | caller side in AuthService / UsersService |
| `mail/mail.service.ts` | `infra/mail/mail.service.ts` (transporter, subjects, send + 1 retry, 503) |
| `crypto/*` | `security/otp.service.ts` |
| `auth/jwt.service.ts`, refresh-token helpers, minting/revoking parts of `session.service.ts` | `security/tokens.service.ts` (`@nestjs/jwt`; JWKS via Node `crypto`, no `jose`) |
| `auth/refresh-tokens.repository.ts` | `security/refresh-tokens.repository.ts` |
| registration / login / password-reset services + session orchestration | `auth/auth.service.ts` |
| the 4 auth controllers | existing `auth/auth.controller.ts` + `@Public`, `@HttpCode`, `@CurrentUser` |
| `auth/jwks.controller.ts`, `health/health.controller.ts` | `utils/` |
| `auth/caller.ts`, `UserStatus` | `common/enums/*`, `common/types/auth-user.ts` |
| `auth/decorators.ts` | `common/decorators/*` (`@CurrentUser` reads `req.user`) |
| `jwt-auth.guard.ts` + `roles.guard.ts` | `common/guards/auth.guard.ts` |
| `common/app-error.ts`, `error-codes.ts`, `error.filter.ts` | `common/errors/*` (audit log reads `req.user`) |
| `common/logger.ts` | `common/logging/logger.ts` |
| `common/zod-validation.pipe.ts`, `otp/otp.module.ts`, `auth/auth.schemas.ts` | dropped (replaced) |
| `users/users.repository.ts` | `users/users.repository.ts` (via DatabaseService) |
| users, admin, admin-lock, admin-bootstrap services; `profile.mapper.ts` | `users/users.service.ts` (+ `dto/profile.response.ts`) |
| `users/users.controller.ts`, `admin.controller.ts` | `users/users.controller.ts`, `users-admin.controller.ts` |
| `users/users.schemas.ts` | `users/dto/*` built from `fields.ts` |
| `postman/…collection.json` | `postman/…collection.json` (verified) |
| `Dockerfile`, `compose.yaml` | same names, paths updated (`COPY db/migrations`) |
| `*.spec.ts`, `src/test/env.setup.ts` | not ported |

Delete `src/auth/auth.repository.ts`. Leave the scaffold `*.spec.ts` files.

## Implementation order
1. **`ai/open_decisions.md`** with context for each item: gateway-bypass + stale-token 15-min window (ports published); BullMQ / async mail (mail is sent synchronously by MailService; adopting BullMQ means adding `infra/mail/mail.processor.ts` with the send logic and making `sendOtp` enqueue, which drops the 503 on mail failure); `mail.processor.ts` from the original target structure intentionally omitted; Dockerfile path for migrations after rename; GET /admin/users pagination/email filter and `/internal/users/:userId` documented but not built; migrate CLI as a future deploy step; Redis layout change (`reg:` → `otp:REGISTRATION:`) to reflect in AGENTS.md; `@nestjs/config` as a deliberate exception to "no extra modules"; root compose include swap at rename time.
2. **Update `ai/instructions.md`** to match every decision above.
3. **Project setup:** CommonJS switch, `.js` suffix removal in existing files, add deps (`@nestjs/config`, `@nestjs/jwt`, `pg`, `ioredis`, `bcryptjs`, `nodemailer`, `@types/pg`, `@types/nodemailer`), `migrate` script.
4. **common/ + config/**, then **infra/**, then **security/**, then **users/**, then **auth/**, then **utils/** + **app.module/main**.
5. **db/migrations**, **Dockerfile**, **.dockerignore**, **compose.yaml**.
6. **Postman:** copy the collection; check every request body and assertion against `fields.ts` and the DTOs (e.g. validation `fields` names, strict unknown-field 400s, mobile check on `mobileNumber`); adjust only where the new rules differ, and list each change.
7. **Attribution:** new disclosure header on every touched file ("adapted from `user-service/src/<file>`; original disclosure: <tool, date>"); `// AI-generated (edited by Deanson)` on generated blocks; entry in `refactored-user-service/ai/usage-log.md` with exact prompts.

## Detail for a fresh session (agreed specs)
**Read first:** root `AGENTS.md`, `user-service/AGENTS.md` (behaviour reference), `refactored-user-service/ai/instructions.md`, existing `refactored-user-service/src/common/validation/fields.ts` + `src/auth/dto/*` (keep as is; strip `.js` suffixes only). The old code under `user-service/src` is the source of truth for behaviour, status codes, error codes and messages. All design choices in this plan were confirmed by Deanson on 2026-10-16, so they need no further AI-policy warning; anything NOT covered here must be asked first.

**`infra/redis/redis.constants.ts`**: `OtpPurpose` (REGISTRATION, PASSWORD_RESET, EMAIL_CHANGE, NEW_EMAIL_VERIFY, MOBILE_CHANGE, PASSWORD_CHANGE, DEACTIVATION); `otpKey(purpose, subject)` = `otp:{purpose}:{subject}`; `otpRequestKeys(subject)` = `otpreq:{s}` / `otpblock:{s}`; `loginKeys(emailHash)` = `loginfail:{h}` / `loginlock:{h}`; `OTP_TTL_SECONDS=300`, `OTP_MAX_ATTEMPTS=3`, `PENDING_SIGNUP_TTL_SECONDS=900`, `OTP_REQUEST_LIMIT={threshold:4, windowSeconds:600, blockSeconds:900}`, `LOGIN_LIMIT={threshold:5, windowSeconds:900, blockSeconds:900}`. Subject = emailHash for register/resend/forgot/reset, userId for `/users/me/*`.

**`infra/redis/redis.scripts.ts`**: 
- `VERIFY_OTP` (KEYS[1]=record; ARGV hash, maxAttempts, nowMs, consume 0/1): no key → EXPIRED; `otpExpiresAt <= now` → EXPIRED (record kept); hash match → DEL if consume, return OK + raw; else attempts++, on reaching max DEL + EXPIRED, else SET KEEPTTL + INVALID with attemptsRemaining. (Merges old VERIFY_OTP_LUA + CHECK_OTP_LUA.)
- `HIT_LIMIT` (KEYS counter, block; ARGV threshold, window, block): block TTL > 0 → BLOCKED ttl; INCR, EXPIRE on first; count >= threshold → SET block EX, DEL counter, BLOCKED block; else OK. (Merges old RATE_LIMIT_LUA and RECORD_LOGIN_FAILURE_LUA; same behaviour with thresholds 4 and 5.)
- `REPLACE_OTP_CODE` (KEYS record; ARGV hash, expiresAtMs): missing → 0; set otpHash, otpExpiresAt, attempts=0, SET KEEPTTL → 1.

**`RedisService` public API** (returns data, never throws HTTP errors): `saveOtp(key, record, ttlSeconds)`, `verifyOtp(key, otpHash, {consume})` → `{status:'OK', record} | {status:'INVALID', attemptsRemaining} | {status:'EXPIRED'}`, `replaceOtpCode(key, otpHash, expiresAt): boolean`, `deleteOtp(key)`, `hitOtpRequestLimit(subject)` → `{blocked, retryAfterSeconds?}`, `getLoginLockTtl(emailHash): number`, `recordLoginFailure(emailHash)` → `{locked, retryAfterSeconds?}`, `clearLoginFailures(emailHash, {unlock?})`. OTP record: `{otpHash, attempts, otpExpiresAt, data?}` (`data` = pending sign-up or encrypted new email). `verifyOtp` with `consume:false` replaces old `otp.check` (EMAIL_CHANGE, PASSWORD_CHANGE flows, spent later via `deleteOtp`).

**`OtpService`** (security; pure, no Redis/DB): `generate()` (6 digits, `randomInt`), `hash(purpose, subject, code)` (HMAC with `USER_OTP_HMAC_KEY`), `hashEmail`, `encrypt`/`decrypt` (AES-256-GCM, iv+tag+ciphertext), `hashPassword`/`verifyPassword` (bcrypt 12, 72-byte guard), `DUMMY_PASSWORD_HASH`, `generateId`. Keys come from ConfigService.

**`TokensService`**: `signAccessToken(userId, role)` (RS256, kid, 15 min), `verifyAccessToken(token)` → `{sub, role}` (throws on invalid), `getJwks()`, `issue(user, tx?)` → `{accessToken, refreshToken, expiresIn:900}`, `revokeLive(token, tx)` → `{userId}|null`, `findRevoked(token, tx)`, `revokeAll(userId, tx?)`, `revokeOwned(token, userId)`. Refresh tokens: 32 random bytes base64url, stored SHA-256, 90-day TTL.

**`DatabaseService`**: `query<T>(sql, params?, tx?)`, `transaction<T>(fn: (tx: PoolClient) => Promise<T>)`. Repositories take an optional `tx`.

**Users DTOs** (`users/dto/`, strict, built from fields.ts): `UpdateProfileDto {displayName}`, `RequestOtpDto {purpose: EMAIL_CHANGE|MOBILE_CHANGE|PASSWORD_CHANGE|DEACTIVATION}`, `ChangeEmailDto {newEmail, otp}`, `OtpDto {otp}`, `ChangeMobileDto {countryCode, mobileNumber, otp}` via `withMobileCheck`, `ChangePasswordDto {otp, newPassword}`, `ChangeRoleDto {role}`, `ListUsersQueryDto {role?, status?}`; `profile.response.ts` = SelfProfile `{userId, displayName, email, countryCode, mobileNumber}` and AdminProfile (+ `role, status, createdAt`).

**`compose.yaml`**: copy of `user-service/compose.yaml` (keep `name: foc`, services `user-db`, `user-redis`, `mailpit`, `user-service`, ports, healthchecks, explicit env list, named volumes) with a new disclosure header. `Dockerfile`: same as old, plus `COPY db/migrations ./db/migrations`.

## Verification
1. `npm run build` in `refactored-user-service` passes.
2. With the old stack stopped, from the repo root: `docker compose -p foc-refactored -f refactored-user-service/compose.yaml --env-file .env up --build`. Use a separate project name so a fresh volume proves migrations apply.
3. Logs show "Database ready" and migration `001_init.sql` applied; `curl localhost:3001/health` → `{"status":"ok"}`.
4. Run the ported Postman collection against `http://localhost:3001` (OTPs from Mailpit on :8025) and report pass/fail per request.
5. Print `tree src/` and list anything unmapped or assumed.
