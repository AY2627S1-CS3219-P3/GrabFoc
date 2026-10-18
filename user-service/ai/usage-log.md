<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15, 2026-10-16
Scope: Wrote this log from the session transcript (prompts quoted verbatim, responses summarised).
Author review: Read in full and reviewed by Deanson, 2026-10-15.
-->

# AI Usage Log — refactored User Service

Follows the template in the repo-root `ai/usage-log.md` (Appendix 2 of the project document):
exact prompts, summarised responses, what was changed or rejected, and how it was verified.
Newest entry first. Progress notes and open items live in [`sessions.md`](sessions.md).


## AI design input and who decided

## Deanson

### 2026-10-16 — Swap the refactored service in as `user-service/`

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, refactor
**Files:** folder renames (`user-service/` → `old-user-service/`, `refactored-user-service/` →
`user-service/`); in this folder: `compose.yaml`, `Dockerfile`, `API.md`, `package.json`,
`package-lock.json` (package name), the Postman collection description, `ai/open_decisions.md`
(items 3 and 8 done, item 11 added). Outside it, each approved by Deanson first:
root `compose.yaml` (disclosure line only) and `.github/workflows/ci.yml` (user-service on Node 24).

**Scenario:** carry out steps 1–6 of `ai/plan.md`.

**Prompts:**
> read refactored-user-service/ai/plan.md for context

> Execute the plan (steps 1 - 6). However, if you end up changing anything outside of the user service scope, inform me first. Clarify before proceeding

**Clarifications answered:**
- Approved: the root `compose.yaml` disclosure line, the `ci.yml` Node 24 change, and stopping
  and restarting the whole stack.
- Also remove the leftover `foc-refactored_user-db-data` / `foc-refactored_user-redis-data`
  volumes.

**What it produced:** the renames and text edits above; `package.json` now has
`"test": "vitest run --passWithNoTests"` and `"engines": { "node": ">=24" }`.

**Blocked actions, run by Deanson:** Claude Code's auto-mode safety check blocked two commands,
so Deanson ran them: deleting the two scaffold specs (`auth.controller.spec.ts`,
`auth.service.spec.ts`), and `docker volume rm` for `foc_user-db-data`, `foc_user-redis-data` and
the two `foc-refactored_*` volumes. `foc_supplier-db-data` was kept.

**Verification:**
- **CI, simulated in `node:24-alpine`:** `npm ci`, `npm test` and `npm run build` all pass.
  `npm test` failed before the specs were deleted (`ReferenceError: describe is not defined`).
- **Full stack** (`docker compose up --build -d` from the root): all eight containers up.
  - `user-db` has `schema_migrations`, `users` and `refresh_tokens`, and one ACTIVE ADMIN (the
    bootstrap admin).
  - `GET :3001/health` returns 200.
  - Supplier: "Locations already exist; seed skipped." Gateway and frontend: started.
- **newman, direct on :3001:** 135 requests, 349 assertions, 0 failures.
- **newman, via the gateway on :3003:** 135 requests, 1 failed assertion out of 349.
  - The failure: "401 logout without a token". The gateway rejects it before it reaches the User
    Service, with `{"error":"Unauthorized"}` and no `code` field. That is gateway behaviour.
  - Health returned 200 through the gateway.
- **Mishap:** the first `up` ran inside `user-service/` (a parallel command had changed
  directory), so the root `.env` wasn't read and the service exited with "Invalid environment".
  Re-running from the root fixed it; no files were changed.

### 2026-10-16 — Password reset keeps the OTP until the password is saved

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate, debug
**Files:** `src/auth/auth.service.ts` (`resetPassword`), `postman/user-service.postman_collection.json`
(new request "400 reset to the current password"), `API.md`, `ai/open_decisions.md` (item 10)

**Scenario:** check how each password endpoint treats the OTP, record the OTP rate-limit issue, then
make `/auth/password/reset` keep its code on a "same as current password" rejection, as
`/users/me/password` already does.

**Prompts:**
> I found these two facts:
> - /auth/password/vreset uses up the OTP code on invalid password formatting causing the user to request another OTP
> - If a user wants to change multiple fields at once, they will get OTP limited?
>
> true or no

> for point 1, what are you saying? i was referring to /auth/password/reset though

> - For /auth/password/reset. What happens on invalid pasword formatting and same password for otp consumtption
> - For /users/me/password. What happens on invalid pasword formatting and same password for otp consumtption
> - Can note the rate limiting thingy down under open_decisions

> Is it possible for /auth/password/reset to mimic the logic of /users/me/password which keeps the OTP code instead of consuming it immediately? Clarify before you proceed

**Clarifications answered:**
- **AI-policy warning:** the AI flagged this as a security trade-off on a public endpoint and a
  departure from the old service. Deanson chose to make the change.
- **Verification chosen:** `npm run build`, a new Postman case, and a redeploy plus a newman run.

**What it produced:**
- Answers:
  - fact 1 is false for bad formatting (the DTO rejects it before the code is touched), but true
    for a new password equal to the current one;
  - fact 2 is true (one shared bucket per user, and an email change counts twice).
- `ai/open_decisions.md` item 10, on the shared OTP request bucket.
- `resetPassword`: checks the code with `consume: false` and deletes it only after the new password
  is saved. On the unreachable "no active account" branch the code is still deleted.
  Wrong guesses still count against the code's 3 attempts.
- The new Postman request: reset with the current password expects 400, and then "Reset password"
  succeeds with the same code.

**Problems during verification** (caused by the AI, and its mistakes):
- It ran newman a second time with the output hidden, then sent a manual forgot-password `curl`.
  The curl was the admin address's 4th OTP request, which started a 15-minute block. The AI
  deleted that one `otpblock` key in the test Redis.
- The admin steps still failed. The cause is not the code change: no account has the configured
  `adminEmail` any more (the logs show `PASSWORD_RESET_NOT_SENT reason: NO_ACCOUNT`). The
  bootstrap admin had been renamed and its email changed during manual testing.

**Follow-up prompts:**
> *(choice)* Wipe the test DB (down -v)

> just to double confirm, u already updated usage-log?

**What I changed or rejected:** chose to wipe the `foc-refactored` test volumes (`down -v`) to get
a clean bootstrap admin. This deleted the accounts created during manual testing.
**Verification:**
- `npm run build` passes; the `user-service` container was rebuilt and is healthy.
- **Before the wipe:** newman ran 135 requests. The Password reset folder passed, including the new
  case (400, then 204 with the same code). All 29 failing requests were the admin knock-on effect
  described above.
- **After the wipe:** the logs show `Applied 001_init.sql`, `Database ready` and
  `ADMIN_BOOTSTRAPPED`. One newman run: **135 requests, 349 assertions, 0 failures**.
  - "400 reset to the current password" returned 400, then "Reset password" returned 204 with
    the same code.
  - The count checks out: 119 collection requests + 12 Mailpit lookups + 4 lockout logins = 135.

### 2026-10-16 — API reference and manual Postman guide

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, explain
**Files:** `API.md` (new)

**Scenario:** document the refactored service's endpoints for the team, and explain how to test
it by hand in Postman.

**Prompts:**
> Can you write me an api reference markdown file for this refactored user service and tell me how to manually test my program via postman with the base_url and port?

**What it produced:**
- `API.md`, written from the current controllers, DTOs, `fields.ts` and services:
  - the base URL (`http://localhost:3001`, or the gateway on `:3003` in the full stack);
  - authentication, the error envelope and every error code;
  - field rules and limits;
  - every endpoint, with its request body, response and errors.
- A manual Postman walkthrough: setup, the main flow step by step, error cases, claiming the
  bootstrap admin, and the automated collection.

**What I changed or rejected:** —
**Verification:** pending Deanson's review.

### 2026-10-16 — Restructure plan, steps 4–7 (port, Docker, Postman, attribution)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, refactor, debug
**Files:** every file under `src/` except `common/validation/fields.ts` and `auth/dto/*`
(removed `src/auth/auth.repository.ts`); `db/migrations/001_init.sql` (copied unchanged);
`Dockerfile`, `.dockerignore`, `compose.yaml`; `postman/user-service.postman_collection.json`;
`tsconfig.json`; `ai/plan.md` (Docker row), `ai/open_decisions.md` (item 9)

**Scenario:** port the old User Service into the agreed structure, then prove it builds, boots
in Docker and passes the Postman collection.

**Prompts:**
> - Yes i agree with your changes
> - Update usage-log.md, emove the date line entirely

> Continue with step 4 to step 7. Ensuring that npm run build, existing / new postman tests passes and containerized version of the refactored application runs. Let me know once step 7 is finished. Ensuring that nestjs file structure principles is followed.
>
> Clarify before proceeding.

**Clarifications answered:**
- **Docker:** Deanson starts Docker and the AI stops the old stack. No old stack was running.
- **Postman runner:** `npx newman`, with nothing saved to `package.json`.
- **"New Postman tests":** for each endpoint, test validation such as bad OTP format, missing
  field, weak password and bad email, since the DTOs and `fields.ts` redefine the schemas.
- **File structure:** the `plan.md` tree is enough.

**What it produced:**
- Ported `common/`, `config/`, `infra/`, `security/`, `users/`, `auth/` and `utils/` following
  `ai/plan.md`. Behaviour, routes, status codes, error codes and messages come from the old
  `user-service/src`.
- One planned rule change: `reactivate` re-checks in the database that the caller is an ACTIVE
  ADMIN.
- New file headers say which old file each one was adapted from, with the original disclosure.
- The Docker files are drop-in copies of the old ones.
- Postman:
  - the old collection is copied with no request or assertion changed; each was checked against
    the new rules and still holds;
  - a new **Validation** folder adds 63 requests, one 400 case per field rule for every endpoint.
- **Deviations found while testing:**
  - The base image is `node:24-alpine`, not node:22: npm 10 rejects the lock file under `npm ci`.
  - Removed `"incremental"` from tsconfig: with Nest's `deleteOutDir`, a rebuild with no changes
    left `dist/` without `main.js`.
  - For the test run only, a scratchpad override published `user-db` on host port 55432, because
    a local Postgres already holds 5432. `compose.yaml` keeps `5432:5432`.
- **Found, not changed:** audit lines redact the error `code` field. The old service does the
  same; it is logged as open decision 9.

**What I changed or rejected:** —
**Verification:**
- `npm run build` passes, also when rebuilding with no changes.
- `docker compose -p foc-refactored -f refactored-user-service/compose.yaml --env-file .env up --build`
  on a fresh volume:
  - the logs show `Applied 001_init.sql`, `Database ready` and `ADMIN_BOOTSTRAPPED`;
  - `GET /health` returns `{"status":"ok"}`.
- `npx newman@6 run postman/user-service.postman_collection.json --env-var adminEmail=<bootstrap email>`:
  133 requests, 347 assertions, 0 failures.
- The service log has no `ERROR` lines and no email addresses.

### 2026-10-16 — Restructure plan, steps 1–3 (open decisions, instructions, CommonJS setup)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, refactor
**Files:** `ai/open_decisions.md`, `ai/instructions.md`, `ai/plan.md` (one row), `package.json`,
`package-lock.json`, `tsconfig.json`, and every `src/` file with relative imports (suffix strip only)

**Scenario:** start executing the agreed restructure plan (`ai/plan.md`), limited to the docs and
project setup before any code is ported.

**Prompts:**
> read refactored-user-service/ai/plan.md and understand the task at hand. Clarify with me that u understand before proceeding.

> Yes correct. Implement steps 1 to 3 first.

**What it produced:**
- `open_decisions.md`: the 8 deferred items from plan step 1, each with its current behaviour
  and what is still open.
- `instructions.md`: the target tree and rules, updated to the plan's decisions (AuthGuard,
  `USER`/`ADMIN`, synchronous mail with no BullMQ, `config/`, `utils/`, `errors/`, `logging/`,
  full ports instead of TODO stubs).
- CommonJS switch:
  - removed `"type":"module"`;
  - stripped the `.js` suffixes from the 30 relative imports;
  - replaced `await bootstrap()` with `void bootstrap()`;
  - added a `migrate` script.
- Installed `@nestjs/config`, `@nestjs/jwt`, `pg`, `ioredis@^6` (same major as the old service),
  `bcryptjs`, `nodemailer`, `@types/pg` and `@types/nodemailer`.
- **Deviation from the plan:** TypeScript 6 rejects `moduleResolution: node` (TS5107, deprecated).
  The AI used `module`/`moduleResolution: nodenext` instead, which emits CommonJS when
  package.json has no `"type"`. The plan row was updated to match.

**What I changed or rejected:** approved the `nodenext` deviation and the other changes as made.
**Verification:**
- `npm run build` passes.
- `dist/main.js` uses `require` (CommonJS).
- The built app boots and maps the `/auth` routes.
### 2026-10-15 — Session logs and file headers

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate
**Files:** `ai/usage-log.md`, `ai/sessions.md`, AI disclosure headers on the code files listed in the entries below

**Scenario:** record this session under the AI policy before continuing the refactor.

**Prompts:**
> 1. Log the current session based on the AI policy under refactored-user-service/ai/usage-log.md
> 2. Log the current session and progress done under refactored-user-service/ai/sessions.md. Help me write a note stating that we should implement postman tests for field validation wise for all auth endpoints.
>
> Clarify before proceeding

**What it produced:** this log, `sessions.md`, and a 4-line disclosure header on each
AI-written or AI-edited code file.
**What I changed or rejected:** —
**Verification:** I read both logs and every header in full.

### 2026-10-15 — Install Zod and `nestjs-zod`, global validation pipe, error shape

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, debug, explain
**Files:** `package.json`, `package-lock.json`, `src/app.module.ts`

**Scenario:** make the Zod DTOs actually validate requests, and decide what a validation error
looks like to the frontend.

**Prompts:**
> install zod and nestjs-zod in the project;
> register nestjs-zod's global validation pipe;
> decide whether validation errors keep nestjs-zod's default shape or use your own { error: { code, … } } body.
>
> Do the first two tasks for me first. we will talk about the last task after u are done]

> i thought u wanted to use zod 4?

> Downgrade the project to Nest 11. This is officially supported and matches your other services, but it changes every @nestjs/* package.
>
> u mean dOWNGRADE the refactored user service right

> what was the reshape done by the old service

> what's your recommendation

> so if your recommendation to have an interceptor for global error payload?? or what

> I guess let's just follow the older service response / payload so frontend changes is minimal

> what are you porting over and where are u placing them?

**What it produced:**
- Found that `nestjs-zod` 5.5.0 only supports Nest 10/11, while the scaffold was Nest 12.1.2.
  Explained that Zod 4 was not the problem.
- Downgraded every `@nestjs/*` package in this folder only to 11.x (common/core/platform-express/testing 11.2.7,
  cli 11.0.24, schematics 11.1.0). Installed `zod` 4.6.7 and `nestjs-zod` 5.5.0 with no peer conflicts.
- Registered `nestjs-zod`'s `ZodValidationPipe` as `APP_PIPE` in `app.module.ts`.
- Explained the old service's error shape (pipe → `AppError` with `{ field, message }` list;
  global `ErrorFilter` → `{ error: { code, message, details } }`) and why a filter, not an
  interceptor, is the right place.
- Proposed a file-by-file port of `AppError`, `error-codes.ts`, `ErrorFilter` and the audit
  helpers.

**What I changed or rejected:**
- Chose the Nest 11 downgrade instead of the AI's recommended peer-dependency override.
- **Rejected implementing the error-envelope port for now** ("let's keep this an open note for
  now, skip this"). It is recorded as an open item in `sessions.md`. Nothing was written.

**Verification:**
- `tsc --noEmit` reports only the 8 expected errors (controller calls `AuthService` methods not
  written yet).
- A throwaway Nest app in a scratch folder, using the real `RegisterDto` and the same global
  pipe:
  - a valid messy body reached the controller normalised (201);
  - a bad email + landline + extra `role` returned 400 with all three errors.
