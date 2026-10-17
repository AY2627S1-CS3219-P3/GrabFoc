<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: Wrote these notes from the open items in ai/plan.md (step 1), with context from the old user-service.
       2026-10-16: marked items 3 and 8 done after the swap; added item 11 (the --passWithNoTests flag).
Author review: Successfully reviewed by Deanson, 2026-10-16.
-->

# Open decisions — refactored User Service

Items that `ai/plan.md` deliberately leaves open or defers. Each one says what the refactor does
**now**, so the code isn't blocked, and what is still to be decided. The team decides these, not
the AI (root `AGENTS.md`, AI-agent rules). Where the item is a brief assumption, check it with the
mentor.

## Gateway bypass and the 15-minute stale-token window
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

## Async mail (BullMQ), and the missing `mail.processor.ts`
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

## One OTP request bucket per user for all self-service changes (noted 2026-10-16)
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

## CI passes with zero tests — temporary (noted 2026-10-16)
- **Now:** `npm test` is `vitest run --passWithNoTests`, and the two Nest scaffold specs
  (`auth.controller.spec.ts`, `auth.service.spec.ts`) were deleted, so the CI job passes with no
  tests. The CI matrix runs this service on Node 24 (`engines: node >=24` in `package.json`).
- **Temporary:** CI passes with zero tests; add real tests for OTP/crypto, lockout and refresh
  rotation, then remove the flag.
