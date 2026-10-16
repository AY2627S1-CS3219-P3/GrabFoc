<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: Wrote these notes from the open items in ai/plan.md (step 1), with context from the old user-service.
Author review: Pending Deanson's review.
-->

# Open decisions — refactored User Service

Items that `ai/plan.md` deliberately leaves open or defers. Each one says what the refactor does
**now**, so the code isn't blocked, and what is still to be decided. The team decides these, not
the AI (root `AGENTS.md`, AI-agent rules). Where the item is a brief assumption, check it with the
mentor.

## 1. Gateway bypass and the 15-minute stale-token window
- **Now:** compose publishes the service port (`3001:3001`), as the old service did, so a client
  can reach the User Service without going through the API Gateway. The global `AuthGuard`
  therefore verifies the JWT again itself (RS256, via `TokensService.verifyAccessToken`) instead
  of trusting gateway headers.
- The guard trusts the `role` claim in the token without a database lookup. A demotion,
  suspension or deactivation only takes full effect when the user's access token expires, up to
  **15 minutes** later. Refresh is blocked straight away, because refresh checks status in
  `AuthService`.
- The exception is `reactivate`, which re-checks in the database that the caller is still an
  ACTIVE ADMIN.
- **Open:**
  - Stop publishing the port outside the compose network?
  - Have services trust gateway headers instead (root `AGENTS.md` §10, "how services receive
    identity")?
  - Accept the 15-minute window, or check status in the DB on sensitive routes?

## 2. Async mail (BullMQ), and the missing `mail.processor.ts`
- **Now:** `infra/mail/mail.service.ts` sends synchronously with nodemailer, retries once, and
  answers **503** if both attempts fail. It is a port of the old `SmtpMailService`.
  `forgot-password` still never returns 503 (it logs the failure and answers 202).
- The original target structure in `instructions.md` listed `infra/mail/mail.processor.ts` (a
  BullMQ worker). It is **intentionally omitted**, because nothing would enqueue jobs for it.
- **If BullMQ is adopted:**
  - add `@nestjs/bullmq` and register the `mail` queue in InfraModule;
  - create `mail.processor.ts` holding the current send logic;
  - make `MailService.sendOtp` only enqueue.
- **Trade-off:** the request no longer learns whether the send failed, so the 503 on mail failure
  disappears. It would also close the forgot-password timing leak (`user-service/AGENTS.md`,
  "Forgot-password timing"). Adopting BullMQ also needs a Redis decision: reuse `user-redis` or
  add a separate queue Redis.

## 3. Dockerfile migrations path after the rename
- **Now:** migrations move from `migrations/` to `db/migrations/`. The Dockerfile copies
  `db/migrations ./db/migrations`, and the migrator resolves
  `path.resolve(__dirname, '../../../db/migrations')` from `dist/infra/database/`.
- **Open:** after renaming `refactored-user-service` to `user-service`, confirm that nothing
  else (CI, docs, root README) still points at `user-service/migrations/`.

## 4. Documented in the old service but not built
- `GET /admin/users` **pagination** and an **email filter**. The refactor keeps the old
  behaviour, `role?` and `status?` filters only.
- `GET /internal/users/:userId` (service-to-service lookup) is documented in
  `user-service/AGENTS.md` but not implemented. It isn't ported.
- **Open:** whether either is needed for D3/D4, and how an internal route is protected from
  outside callers (see item 1).

## 5. Migrate CLI as a deploy step
- **Now:** migrations run at startup (`DatabaseLifecycle` in InfraModule). `migrate-cli.ts` and
  `npm run migrate` (`node dist/infra/database/migrate-cli.js`) are kept, but nothing calls them.
- **Open:** run migrations as a separate deploy or CI step (for the cloud deployment N2H) instead
  of at boot, so several replicas don't race.

## 6. Redis key layout change, to carry into `AGENTS.md`
- **Now:** the pending sign-up moves from `reg:{emailHash}` to **`otp:REGISTRATION:{emailHash}`**
  (TTL still 15 min), using the same record shape as every other OTP:
  `{otpHash, attempts, otpExpiresAt, data?}`, where `data` holds the pending sign-up.
  The other keys are unchanged: `otp:{purpose}:{subject}`, `otpreq:` / `otpblock:`,
  `loginfail:` / `loginlock:`.
- **To do at rename time:** update the "Redis keys" table in `user-service/AGENTS.md` (which
  lists `reg:` and says "REGISTRATION (kept inside `reg:`)").
- Old `reg:` keys from a running stack are simply ignored. They expire within 15 minutes.

## 7. `@nestjs/config`, an exception to "no extra modules"
- `instructions.md` says "Don't add extra modules". The plan uses
  `ConfigModule.forRoot({ isGlobal: true, validate })` with the old Zod env schema
  (`src/config/env.validation.ts`). It is a library module, not a project module, and it
  replaces the hand-rolled `config.ts` singleton.
- **Open:** confirm the team is happy with this exception.

## 8. Root compose include swap at rename time
- **Now:** the root `compose.yaml` includes `user-service/compose.yaml`. The refactor's
  `compose.yaml` uses the same `name: foc`, service names (`user-service`, `user-db`,
  `user-redis`, `mailpit`), ports and env list, so it drops in. Until the rename, test it on its
  own with `-p foc-refactored`.
- **To do at rename time:**
  1. delete the old folder;
  2. rename the refactor to `user-service/`;
  3. check that the root include path still resolves;
  4. check that the gateway's `USER_SERVICE_URL` (or equivalent) still reaches `user-service:3001`.

## 9. Audit lines redact the error `code` (found 2026-10-16)
- `UNAUTHORISED_ACCESS` lines print `"code":"[REDACTED]"`: the redactor treats any field named
  `code` as an OTP (`common/logging/logger.ts`, `SENSITIVE_FIELDS`). The old service behaves the
  same, so the port keeps it.
- **Open:** rename the audit field (e.g. `errorCode`), or narrow the redaction rule, so the
  centralized logging N2H can see which error was returned.

## 10. One OTP request bucket per user for all self-service changes (noted 2026-10-16)
- **Now:** every `/users/me/*` OTP request counts against one bucket per user, `otpreq:{userId}`:
  3 requests per 10 minutes, then the 4th starts a 15-minute block (429 `RATE_LIMITED`).
  - `POST /users/me/otp` (any purpose) counts 1.
  - An email change counts **2**: `/users/me/otp` for `EMAIL_CHANGE`, then `POST /users/me/email`.
- A user changing several fields in one sitting can be blocked without ever mistyping a code.
  Example: email + mobile + password is 4 requests, so the password OTP request gets 429.
- The old service behaves the same; `user-service/AGENTS.md` records this as an open item.
- **Open (a rate-limit / security trade-off, so the team decides):**
  - a separate bucket per purpose;
  - a higher limit for logged-in self-service than for the anonymous register/forgot flows;
  - or keep the current limit.
- If the limit changes, update the `OTP_REQUEST_LIMIT` usage in `infra/redis/redis.constants.ts`
  and the `otpRequestKeys` builder.
