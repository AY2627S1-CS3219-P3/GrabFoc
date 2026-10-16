<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: Updated Deanson's original instructions to match the decisions in ai/plan.md (guard, roles, mail without BullMQ, config/, utils/, errors/, logging/, full ports instead of TODO stubs). The original task, guidelines and rules are Deanson's.
Author review: Pending Deanson's review.
-->

You are restructuring an existing NestJS (TypeScript) project into the structure below. This is a RESTRUCTURE + PORT task: move the existing code into the right places, port its business logic as it is (simplified only where `ai/plan.md` agrees), and wire the modules. Do NOT invent business logic beyond what already exists in the repo. We are restructuring the old `user-service` into `refactored-user-service`, which will later be renamed to `user-service` and replace it.

The agreed decisions are in `ai/plan.md`; deferred items are in `ai/open_decisions.md`.

## Context
Authentication service for an errands app.
- Auth: JWT access tokens (RS256, 15 min) + rotating refresh tokens stored hashed in Postgres
- Email OTP for registration, password reset, email change, mobile change, password change and deactivation
- Redis for OTP state (pending sign-ups, attempt counters, request cap/block) and login brute-force lockout
- Postgres via RAW SQL (pg Pool, no ORM)
- Mail sent synchronously by `MailService` (nodemailer, 1 retry, then 503). BullMQ is deferred (see `open_decisions.md`).
- An API gateway sits in front and verifies the JWT. The service verifies it again, because its port is published.
- Fields (email, mobile) are normalised by the DTOs before they reach the services.
- Endpoints: every route of the old user service, unchanged.
- The source of truth is the old user service. The refactored user service follows best practices.
- Module system: CommonJS (no `"type":"module"`, no `.js` import suffixes, no top-level `await`).

## Target structure

```
src/
├── main.ts                           // global ErrorFilter, RedactingLogger, enableShutdownHooks, port from ConfigService
├── app.module.ts                     // ConfigModule, InfraModule, SecurityModule, AuthModule, UsersModule;
│                                     // APP_GUARD -> AuthGuard, APP_PIPE -> ZodValidationPipe; JwksController, HealthController
│
├── config/env.validation.ts          // Zod env schema (old config.ts) used by ConfigModule.forRoot({ isGlobal, validate })
│
├── common/                           // NO module, plain files
│   ├── guards/auth.guard.ts          // global guard: @Public() -> skip; no Bearer / bad token -> 401; sets req.user; @Roles -> 403
│   ├── decorators/
│   │   ├── public.decorator.ts       // @Public() = SetMetadata('isPublic', true)
│   │   ├── roles.decorator.ts        // @Roles(...roles) = SetMetadata('roles', roles)
│   │   └── current-user.decorator.ts // @CurrentUser('id'?) param decorator, reads req.user
│   ├── enums/
│   │   ├── role.enum.ts              // Role { USER = 'USER', ADMIN = 'ADMIN' }
│   │   └── user-status.enum.ts       // UserStatus (as in the old service)
│   ├── types/auth-user.ts            // interface AuthUser { id: string; role: Role }
│   ├── validation/fields.ts          // shared Zod field rules
│   ├── errors/                       // app-error.ts, error-codes.ts, error.filter.ts (response shape unchanged)
│   └── logging/logger.ts             // RedactingLogger
│
├── utils/                            // jwks.controller.ts (/.well-known/jwks.json), health.controller.ts (/health)
│
├── infra/                            // ONE @Global module
│   ├── infra.module.ts               // provides + exports ONLY DatabaseService, RedisService, MailService (never the raw pg pool or redis client)
│   ├── database/
│   │   ├── pg-pool.provider.ts       // PG_POOL token + factory provider building pg.Pool from the database URL
│   │   ├── database.service.ts       // query(sql, params?, tx?) and transaction(fn): connect, BEGIN, COMMIT/ROLLBACK, release
│   │   ├── database.lifecycle.ts     // runs migrations at startup; provided by InfraModule, not exported
│   │   ├── migrator.ts               // applies db/migrations/*.sql
│   │   └── migrate-cli.ts            // `npm run migrate`
│   ├── redis/
│   │   ├── redis.provider.ts         // REDIS_CLIENT token + factory provider building ioredis from the redis URL
│   │   ├── redis.constants.ts        // key builders, TTLs, limits, OtpPurpose (following the old user-service)
│   │   ├── redis.scripts.ts          // Lua: VERIFY_OTP, HIT_LIMIT, REPLACE_OTP_CODE
│   │   └── redis.service.ts          // the ONLY class that touches Redis
│   └── mail/
│       └── mail.service.ts           // sendOtp(email, code, purpose): synchronous nodemailer send, 1 retry, then 503
│
├── security/                         // shared by auth + users
│   ├── security.module.ts            // JwtModule (RS256); provides OtpService, TokensService, RefreshTokensRepository; exports ONLY OtpService, TokensService
│   ├── otp.service.ts                // PURE crypto, no Redis/DB: OTP generate/hash, email HMAC, AES-GCM, bcrypt, dummy hash, generateId
│   ├── tokens.service.ts             // access tokens, JWKS, refresh tokens stored HASHED
│   └── refresh-tokens.repository.ts  // raw SQL for the refresh_tokens table. NOT exported from the module.
│
├── auth/
│   ├── auth.module.ts                // imports UsersModule, SecurityModule; controllers [AuthController]; providers [AuthService]
│   ├── auth.controller.ts            // /auth/*
│   ├── auth.service.ts               // orchestration only, NO SQL. Owns db.transaction for register/verify and refresh.
│   └── dto/
│
└── users/
    ├── users.module.ts               // imports SecurityModule; controllers [UsersController, UsersAdminController]; providers [UsersService, UsersRepository]; exports ONLY UsersService
    ├── users.controller.ts           // /users/me*: get, update profile, deactivate, request+verify email / mobile / password change
    ├── users-admin.controller.ts     // /admin/users*, class-level @Roles(Role.ADMIN): list, change role, reactivate
    ├── users.service.ts              // business rules, admin lock, first-admin bootstrap, profile mapping.
    │                                 // Password change = db.transaction(update hash + tokens.revokeAll(userId, tx))
    ├── users.repository.ts           // raw SQL for the users table. NOT exported from the module.
    └── dto/                          // includes profile.response.ts

db/migrations/001_init.sql            // users (unique email_hash), refresh_tokens — unchanged from the old service
Dockerfile, .dockerignore, compose.yaml // drop-in replacements for the old ones (same service names, ports, env)
postman/                              // the old collection, checked against the new rules
```


## Guidelines
- No circular imports. AuthModule -> UsersModule, SecurityModule. UsersModule -> SecurityModule. SecurityModule imports only JwtModule. InfraModule is @Global.
- One table, one owner: only UsersRepository writes SQL against `users`; only RefreshTokensRepository against `refresh_tokens`. Auth has NO repository.
- Controllers only touch DTOs and @CurrentUser(). Services never write SQL. Repositories never touch Redis. OtpService never touches Redis.
- Repositories accept an optional transaction client so cross-table writes can be atomic.
- AuthGuard is registered globally via APP_GUARD, so every route is protected unless marked @Public().
- Generally follow guard -> pipes -> controller -> service -> repository
    - Controller simply routes requests
    - Services do business logic
    - Repository interacts with the database

## What to do
1. Inspect the current user-service and map existing files/code onto the target structure in refactored-user-service (the mapping is in `ai/plan.md`).
2. MOVE and RENAME existing code accordingly, and port its logic. Rewrite logic only where `ai/plan.md` agrees; otherwise go through me first.
3. Create every file listed above with correct imports, decorators and typed methods.
4. Make sure `npm run build` (tsc) passes at the end.

## What NOT to do
- Don't add extra modules (no separate Redis/Mail/Database/Otp/Tokens modules), no auth.repository.ts. The one agreed exception is `@nestjs/config`'s ConfigModule. Don't add interceptors yet without my permission.
- Don't export the raw pg pool, the redis client, or either repository.
- Don't write any tests yet
- Don't change the public API shape of existing endpoints.
- If you have to assume, ask me first before proceeding

When done, print the final `tree src/` and list anything you couldn't map or had to assume.
