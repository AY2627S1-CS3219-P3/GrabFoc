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

### 2026-10-12 to 2026-10-15 — Finalising the auth DTO field rules

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, debug, explain
**Files:** `src/common/validation/fields.ts`, all 7 files in `src/auth/dto/`, `package.json` (`libphonenumber-js`)

**Scenario:** replace the skeleton `z.string()` placeholders with final shared field rules, one
field at a time. For each field the AI (1) described the old service's rule, (2) listed
decisions and trade-offs, and after I decided, (3) listed affected DTOs and (4) proposed the
implementation for my approval.

**Prompts:**
> Hi hi, sorry I got distracteed. This chat is purely focused on CS3219 project and the refactoring of the user service

> Task: I would need you to adjust current DTOs to their appropriate finalized form. For example, email needs to be an valid email and have NUS domain.
>
> Let's start with establishing the common validation fields / rules. Starting with email. You can start off with the following (and do the same for subsequent tasks later):
> 1. What is the current implementation for email validation in the existing user-service
> 2. What do you think are the appropriate things to consider when validating this field (email in this case). For example, needs to include '@'.
> 3. What will change in the current DTOs, who will get affected? (You can just keep this question in mind, don't have to answer until we have cleared q1-q2)
> 4. How would you implement the finalized schema under the fields.ts file? What library etc (You can just keep this question in mind, don't have to answer until we have cleared q1-q2)

> clarify that you understand before proceeding to present or ask me things

> Yep you are right. You may proceed.

> should the pipe layer help the hash the email???

> List all the decisions I have to make for step 2 and their respective trade offds, this is in regards to email validation only.

> How do I determine the messages returned from zod validation?? isnt it automated by zod?

> A1. Let the format check reject it will do
> B1. Lowercase the whole address. we should also trim whitespaces
> B2. do nothing
> B3. just keep it in fields.ts? every field has their own normalization? elaobrate more on what u mean
> C1. Zod built-in email check
> C2. Strict
> D1. u.nus.edu and nus.edu.sg
> D2. exact match only
> D3. A constant in code
> E1. no limit
> F1. elaboarte on this since an invalid email cant even pass the otp test
> F2. elboarate
> G1. specific per rule
> H1. elaborate?
> H2. elaborate?

> B3. why are we talking about hashing for incoming fields?
> F1. Don't overcomplicate it. Assume subaddressing edge case wouldn't happen
> F2. anyting works as long as their domain match
> H1. sure
> H2. assume same schema, it's a problem for later anyways. we are still focused on /auth

> named helper

> 1) Show me an example format messages of what is returned if two checks fail
> 2) Do u think i should bail early or no?

> assuming that I don't package the zod return, what will zod return if validation fails in terms of JSON??

> isnt it only one message now?

> move on to password field. Do the same 4 steps

> P1. Let's keep it simple with min(8), max(128), upper + lower + digit, what do u think?
> P2. 8
> P3. elaborate. is brcrypt most suitable here. what about max 128 char?
> P4. Same
> P5. stay the same
> P6. None
> P7. Non empty string only
> P8. what do u suggest?
> P9. Yep
> 10. Stays in the service
> 11. Yes


> Let's stick with bcrypt then
> Report every failing rule

> let's do display name

> N1. yes
> N2. 1
> N3. 100
> N4. Anything
> N5. collapse
> N6. none
> N7. not unique
> N8> no
> N9. keep these
> N10. report all
> N11. reuse

> let's do OTP next

> 1. 6 digits
> 2. strings only
> 3. remove all whitespace
> 4. reject
> 5. keep it
> 6. elborate
> 7. yes

> refreshToken

> R1. non-empty string only
> R2. no
> R3. ok use stringField
> R4.fields.ts
> 5. none

> Yep

> M1. keep two
> M2. trim
> M3. remove whitespace and -, then require 4-15 digits
> M4. mobilesOnly
> m5. any
> m6. only when both passed
> m7. keep
> m8. ok follow your recommendation
> m9. ok
> m10. not unique
> m11. ok

> what messages are shown again for mobile number / country code?

**What it produced** (all in `fields.ts`, wired into the DTOs):
- **`EmailSchema`:** trim + lowercase, Zod email check, exact NUS domain; one message per bad email.
- **`PasswordSchema`:** min 8, max 72 bytes, upper/lower/digit, all failures reported.
  **`LoginPasswordSchema`:** non-empty only.
- **`DisplayNameSchema`:** trim, collapse whitespace, 1–100 characters.
- **`OtpSchema`:** whitespace removed, exactly `OTP_LENGTH` (6) ASCII digits.
- **`RefreshTokenValueSchema`:** non-empty string.
- **`CountryCodeSchema`, `MobileNumberSchema` and `withMobileCheck`:** mobile-only check via
  `libphonenumber-js/mobile`; runs only when both phone fields pass.
- **Shared:** the `stringField` message helper and the exported constants (`ALLOWED_EMAIL_DOMAINS`,
  `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_BYTES`, `MAX_DISPLAY_NAME_LENGTH`, `OTP_LENGTH`).

**What I changed or rejected:**
- **P1:** proposed max 128; changed to 72 bytes after the bcrypt explanation.
- **N4:** chose "anything" over the AI's recommendation to reject control characters.
- **F1/F2:** told the AI not to overcomplicate sub-addressing.

**Verification:**
- Every rule was run against Zod 4.6.7 in a scratch folder with the real `fields.ts`: the final
  run had 67 cases across all fields, all as expected. Every phone case was also run through a
  register-shaped schema.
- The tests caught two bugs, both fixed before finishing:
  1. `abort: true` on the email check disabled the phone check on other fields. Switched to a
     guard on the domain check, with identical email results.
  2. The phone guard crashed on `.strict()`'s path-less issue.

### 2026-10-11 to 2026-10-12 — Setting up the refactor project and auth skeleton

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate, explain
**Files:** `src/app.module.ts`, `src/auth/auth.module.ts`, `src/auth/auth.service.ts`,
`src/auth/auth.repository.ts`, `src/auth/auth.controller.ts`, `src/auth/dto/*.ts` (skeletons);
deleted the scaffold's sample files, `README.md`, Vitest configs, `test/`, nested `.git`

**Scenario:** I created the project with `nest new`. The AI's role, as I set it: supervise, port
existing code, advise but not decide.

**Prompts:**
> Ok. I want you to help me in the process of refactoring our current user service. I will probably be starting with the auth module. Let me first setup the project myself first. Your role is mostly to supervise, import existing code over and advise on decisions (not make them)

> is Redis / OTP service injectables?

> Firstly, help me delete all unnecessary files under refactored-user-service. DO NOT NEED TO WRITE ANY NEW CODE. clarify before prcoeeding

> question. i want a auth.repository.ts, which auth.service.ts imports. it is mainly in charge of talking to the db. how would i do that? is there a specifc command to use?

> Do it 'by hand' for me

> recommendation for where to put DTOs, assuming we are using zod in terms of file structure. should DTOs be feature specific or global?

> show emailSchema, roughly what would it look like and what does it do???

> help write the import for Authservice as a constuctor (i am aware that auth.service is not complete)

> Look at my current auth controller, does it cover all implemented endpoints and do the endpoints themselves make sense?

> if im using zod for validation, you are saying i can't simply do this??

> Yes, all Dtos will be zod classes. Considering this, is my current 'boilerplate' ok?

> add all relevant dtos under the auth/dto folder, skeleton code will do for now. don't have to do anything about isntalling zod yet. just assume zod is already installed and configured

> Can you help me double check your implemented skelton schemas against the original user service schemas. And summarize here in this chat

> tell me what you plan to implement in auth/common/validation/fields.ts

> Wait, so you are saying this Zod pipe will help me normalize and validate fields? so does it validate then normalize?

> how do we check certain stuff like:
> - valid email address
> - nus email domain
> - password is NIST SP 800-63B
> - validate mobile number against countryCode

**Clarifications answered for the deletion:**
- delete the 4 Hello World files and trim `app.module.ts`;
- delete `README.md`;
- delete the Vitest configs and the `test/` folder;
- delete the nested `.git`.

**What it produced:**
- The deletions, with the build still passing.
- An empty `AuthRepository` injected into `AuthService` (the app booted).
- The `AuthService` constructor injection in `AuthController`, plus the DTO imports.
- Seven skeleton `createZodDto` DTOs with field names copied from the old service.
- Reviews of the controller against the old endpoints: missing `refresh` and JWKS, status codes,
  `logout` inputs, `@Public()`, and the need for a global Zod pipe.
- Explanations of providers, injectables, DTOs vs Zod, and how to validate email/NUS domain/
  NIST/phone.

**What I changed or rejected:**
- Wrote and adjusted the controller routes myself.
- Moved `fields.ts` to `src/common/validation/`.
- Stopped the AI's clarifying questions on `fields.ts` to first ask how normalisation and
  validation work.

**Verification:**
- `nest build` passed after the deletions and after adding the repository.
- Started the app and saw "AuthModule dependencies initialized".

### 2026-10-09 to 2026-10-11 — Understanding the old User Service and planning the refactor

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain
**Files:** none in this repo. A handoff doc was written outside the repo at
`~/Documents/NUS/CS3219/user-service-handoff.md`.

**Scenario:** understand the existing `FoC-Template/user-service` before redesigning its
structure; concepts I needed for the refactor.

**Prompts:**
> Read the user service folder and relevant files and understand the project. DO NOT MODIFY ANYTHING. AFTER THAT, SUMMARIZE THE CURRENT USER SERVICE, INCLUDING WHAT FEATURES IT HAS, AND A SHORT SUMMARY OF WHAT EACH ENDPOINT DOES. ALSO GIVE A ROUGH DATA FLOW STRUCTURE.

> I want to replan the whole user-service. The endpoints are correct but the whole file structure and organization is too messy and inconcsitent. What should I start planning and decisions I need to make? These include
>
> - How is rate limiting done?
> - Types of encryption and which to use?
> - How does Zod validation work?
> - What's the industiral standard for Nest.js data flow path? MVC??
> - What endpoints I need to implement, is the current schema satisfactory?
> - Is the current separtion of concerns appropriate instead of file structure?

> Don't make any decisions for me nor record it. I am following the course's AI policy

> Show me a simple example (in terms of data flow) at each layer, and what is written in each layer.

> 1) Can I double check that there is no ORM implemented currently?
> 2) what's a DTO? is it needed?
> 3) what's an entity?

> If i were to add an ORM like Prisma, where would it fit in the layers? And how would I do it?

> I plan to create another repo soley focused on implementing the refactored user service. Log sufficient informaton such that the next session has enough context. Inlcude the following and more:
> - What endpoints need to be implemented and what each endpoint does?
> - What is currently good and bad about the user service

> Clarify before proceeding

> does Zod work together with DTO or does it replaces it?

> what are providers?

> what is dependency injection?

> explain exception handling, is it the last year

> Summarize all currently implemented endpoints, shrot description of what they do and how they are implemented
>
> Summarize current mistakes or key decisions for improvement

> Folder style: group by feature, by layer, or hexagonal.
>
> give example

> What. do u recommend? i will make that decision

**Clarifications answered for the handoff doc:**
- saved outside the repo;
- a plain context doc;
- includes design facts, concept explainers and open decisions;
- no AI header or log entry at that time (this entry now records it).

**What it produced:**
- A summary of the old service: 17 endpoints, features and data flow.
- Lists of open decisions (rate limiting, encryption, Zod, layering, schema).
- Explanations of Nest layers, DTO/entity, Prisma, providers, DI and exception filters.
- The handoff doc.
- Examples of folder styles, plus a recommendation (asked for).

**What I changed or rejected:** told the AI not to make or record design decisions at that stage.
**Verification:** checked against the old code and `user-service/AGENTS.md` while reading.
