<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Recorded the CodeQL workflow configuration and expanded pull request coverage.
Author review: Initial setup approved in PR #23; expanded PR coverage pending human review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Moved the CodeQL entries under the Jian Bing section when merging main into PR #27; entry text unchanged.
Author review: Pending human review on PR #27.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Wrote the PR #30 review-fix entry under the Jian Bing section.
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review on PR #30.
Tool: Claude Code (model: Claude Opus 5), date: 2026-09-29
Scope: Wrote the Cole Lin entries for PRs #7, #28, #30 and #33 from his prompts in the session.
Author review: Cole Lin confirmed the prompts, decisions and verification described.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Wrote the SoCLaaS TLS stopgap entry under the Jian Bing section (PR #36).
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review on PR #36.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Moved lihloway's four Supplier Service entries under the Cole Lin section when merging main into PR #33; entry text unchanged.
Author review: Pending review by Jian Bing and lihloway on PR #33.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Wrote the Supplier Service Docker Compose entry under the Jian Bing section (PR #33).
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review on PR #33.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Resolved the merge of main into PR #33 by adding main's PR #36 entry to the Jian Bing section; no entry text changed.
Author review: Jian Bing approved pushing the resolution; pending his review on PR #33.
-->

# AI Usage Log — FoC (CS3219 AY26/27 S1, Group 3)

Required by Appendix 2 of the project document: *"Maintain a log, `/ai/usage-log.md`, in the
repository with timestamps, prompts, and usage scenarios."* Every AI-assisted change needs an
entry here **as well as** the header comment in each affected file.

## How to add an entry

- Work under **your own `##` heading**. Five people appending to the end of one file conflicts
  on every pull request; editing separate sections does not.
- Newest entry first within your section.
- One entry per pull request. Record the **exact prompts** — paraphrases do not meet the
  policy — but summarise the responses.
- Say what you **rejected or changed**. That is the evidence you reviewed the output rather
  than pasting it.

Template:

```
### YYYY-MM-DD — <what you were doing> (PR #N)
**Tool:** <tool (model)> · **Mode:** generate | refactor | debug | explain
**Files:** <paths>

**Scenario:** why you used it and what for.

**Prompts:**
> exact prompt text

**What it produced:** …
**What I changed or rejected:** …
**Verification:** how you checked it.
```

---

## Zi Yi

### 2026-09-24 to 2026-09-25 — User Service Phase 0 foundation (PRs #9, #10, #12, #13)

**Tool:** Claude Code (Claude Opus 5) · **Mode:** generate, debug, explain
**Files:** `user-service/**` (source, tests, Dockerfile, README, AGENTS.md),
`compose.yaml`, `.env.example`, `.gitignore`

**Scenario.** Our User Service design already existed in our own working plan
(`user-service-work-plan.md`, written by Deanson and me from the D1 backlog). I used Claude
Code to (a) transcribe that design into `user-service/AGENTS.md` so it lived in the repo, and
(b) implement Phase 0 steps 1–4 from it: the NestJS skeleton, database and migrations, error
handling, crypto helpers, RS256 tokens with RBAC, and Redis-backed OTPs with email delivery.

<!-- TODO Zi Yi: check these against your own record and add any I have missed. -->

**Prompts (exact):**

> the code repo is in GrabFoc, my plan is to work on user service. the work plan is in
> user-service-work-plan.md, and workload split is user-service-workload-split.md. do not make
> any edits/implementations yet, lets just discuss on the implementation. note that for all the
> tracked files, try to ensure we keep to the AI guidelines in CS3219-ProjectDocument-FoC.pdf.
> right now maybe we can focus on setting up the phase 0 foundation. should we do this in a
> single commit or what? also i am new to this, so it would be good if you further explain on
> the foundation steps, such as what we need it for

> what is mailpit and mailservice for? for ORM, can you pull branch
> lihloway:feature/supplier-service to check the orm at supplier service? for "RS256 + JWKS" i
> think we can be the ones deciding which algorithm to use.

> okay, what will the user-service/AGENTS.md include?

> now lets do step 1, the nestjs skeleton

> how can i test use docker? or how can i make you help me test docker

> lets move on to step 2

> now we shall do step 3

> now lets work on step 4 on a new branch

> for pr 9,10,12,13 which need fixes?

> explain more on src/crypto boundary call on #12

> for now, we shall not have planned rotation

**What it produced.** The implementation code and tests for steps 1–4, the Dockerfile and
`compose.yaml`, the README, and a transcription of our design into `user-service/AGENTS.md`.
It also explained concepts I had not used before (Mailpit, database migrations, stacked
branches, JWKS, the `jose` library) and debugged failures with me.

**Decisions I made, which it did not:**

- **RS256 + JWKS over HS256.** I decided the algorithm; Claude flagged that it was a security
  trade-off under the AI policy and stopped for my decision.
- **`pg` with plain SQL, no ORM** — to match the Supplier Service, which the team had already
  settled.
- **Numbered migrations rather than startup `CREATE TABLE IF NOT EXISTS`**, after asking
  whether a database is always recreated from empty.
- **The `src/crypto` boundary wording** (Option B: name the two real locations rather than
  move code to satisfy a sentence).
- **No planned key rotation.** I asked what happens if our key leaks accidentally, which
  corrected an assumption in the suggestion I had been given.
- **Stacked pull requests** rather than one large branch.
- The **error body format across services is still open** — recorded as `[Open]` in
  `AGENTS.md` rather than decided unilaterally, because it is a cross-service interface and
  belongs to the team.

**What I changed or rejected:**

<!-- TODO Zi Yi: add anything you edited by hand before committing. -->

**Verification.**

- Read every generated file before committing; the `Author review:` line in each file header
  records what I checked.
- `npm test` (81 unit tests) and `npm run test:int` (18 integration tests against a real Redis).
- `docker compose up --build` — the stack builds and runs; migrations apply; `/health` and
  `/.well-known/jwks.json` respond; an OTP was delivered to the Mailpit inbox and verified;
  data survives a `down`/`up` cycle.
- The schema SQL was applied to PostgreSQL 17 and the columns checked against `AGENTS.md`.
- A token was verified against the live JWKS the way the gateway will, and a token signed with
  a different key was rejected.

**Review findings acted on.** Codex flagged six issues across the four pull requests. Five
were fixed (`logger.fatal` bypassing redaction; SMTP error messages interpolated into a log
line; the inaccurate `src/crypto` boundary claim; the key-rotation limit; the local startup
instructions). The sixth was this log.

### 2026-09-26 to 2026-09-27 — User Service Phase 1 steps 5–9: credentials and sessions (PRs #15, #16, #17, #18)

**Tool:** Claude Code (Claude Opus 5) · **Mode:** generate, debug, explain, verify
**Files:** `user-service/src/auth/**`, `user-service/src/users/**`, `user-service/src/otp/**`,
`user-service/src/config.ts`, `user-service/README.md`, `user-service/AGENTS.md`,
`user-service/postman/`, `.env.example`

**Scenario.** All five steps of Person A's Phase 1 track, from the rules already recorded in
`user-service/AGENTS.md`: sign-up (register / verify / resend), login with lockout, refresh and
logout, forgot/reset password, and the first-admin bootstrap. The rules were ours; the code, the
tests and the doc expansions were generated against them. One branch and one PR per step, each
stacked on the previous one.

**Prompts (exact):**

> implement register, verify and resend otp

> in users.repostiory.ts, is emailhash not required?

> explain the issue simply for POST /auth/register/verify

> keep 400 OTP_EXPIRED

> teach me the steps to do testing on my own

> on a new branch, i want to implement login,lockout,refresh,and logout. but lets implement login
> and lockout first

> implement refresh and logout

> for refresh, what does it mean from a user perspective? like the user will be logged out after a
> period of time?

> let user be logged out after 3months instead of 7days

> on a new branch, i want to implement forget and reset password

> currently, how does the account get locked out and what happens to the user? and how is the
> lockout lifted? also explain simply more on what the decoy record is for

> implement admin bootstrap

**Decisions I made, not the AI:**

- **`OTP_EXPIRED`, not 404, for `/auth/register/verify`** when no sign-up is waiting. The AI
  found the conflict between two lines of our own `AGENTS.md` and explained both sides; I chose
  the 400 and had the rule written down.
- **Refresh tokens last 90 days, not 7.** I asked what the 7 days meant for a user, then decided
  we would rather people stayed logged in for three months.
- **Five failures, not three, before a lockout** — already ours from D1, kept here.
- **The whole admin-bootstrap rule**, which was in `AGENTS.md` before step 9 started: keyed on an
  environment variable rather than an `ADMIN_PASSWORD`; runs only while the table is empty, so
  changing the variable later cannot add an admin; the row carries a NULL password; the account is
  claimed through forgot-password. Deciding it must be claimable that way is also what fixes how
  the address has to be stored.
- **I ran the testing myself** rather than taking the AI's verification runs as the record. It
  found a bug in its own instructions that way: two steps told me to put the variable in front of
  `docker compose up`, which silently does nothing because `compose.yaml` does not forward it.

**AI-proposed, and I adopted them after reading the reasoning.** All four are marked in
`AGENTS.md` and in its disclosure header:

- A **decoy OTP record** for an address with no account, so `POST /auth/password/reset` cannot be
  used to find out who has an account.
- **Lifting a login lockout** after a successful reset.
- The **`'Administrator'` display name** for the bootstrap row. `display_name` is NOT NULL and our
  plan never named one.
- A **startup warning** when `users` has rows but no ACTIVE admin. Our plan describes that state
  as needing a manual database change but asks for no warning. I took it because the state is
  otherwise invisible until someone hits a 403.

One more I want recorded as a judgement call rather than a bare acceptance: validating
`USER_BOOTSTRAP_ADMIN_EMAIL` at startup and **refusing to boot** on a bad value. Our plan does not
say what to do with a malformed address. The argument for failing loudly is that forgot-password
only accepts NUS addresses, so any other domain would silently create an admin account nobody
could ever claim. I agreed, but it changes startup behaviour, so it is called out in `AGENTS.md`
and in the README's troubleshooting list.

**What I changed or rejected:**

<!-- TODO Zi Yi: add anything you edited by hand before committing. -->

**Verification.**

- Read every generated file before committing; each file header's `Author review:` line records
  what I checked.
- `npm test` (213 unit tests) and `npm run test:int` (41 integration tests against a real Redis).
- Ran all five flows against the compose stack with codes read from Mailpit: sign-up, five wrong
  passwords into a 423, refresh rotation, token reuse revoking every session, a full password
  reset, and the bootstrap admin claiming its account.
- **Checked the enumeration rules by measuring, not by reading the code.** An unknown address and
  a wrong password returned byte-identical 401s at 237 ms and 225 ms. `POST /auth/password/reset`
  returned byte-identical 400s for a real account and a made-up address, `attemptsRemaining` and
  all. Confirmed in `psql` that a reset revoked every refresh token (1 live → 0) and in Redis that
  an address with no account still gets an OTP record.
- For step 9, rehearsed the guarded `INSERT … SELECT … WHERE NOT EXISTS … ON CONFLICT DO NOTHING`
  in `psql` against PostgreSQL 17 before trusting it, then checked the concurrency claim with two
  real psql sessions, the first holding its transaction open while the second ran the same
  statement. No duplicate-key error and exactly one row afterwards, so two containers starting
  together cannot crash the boot.
- Ran the bootstrap on a **scratch database**, so the dev data was not wiped: migrations applied,
  then `ADMIN_BOOTSTRAPPED`, then a row with `role=ADMIN`, `status=ACTIVE` and NULL password,
  country code and mobile. Login before claiming gave 401; forgot → code from Mailpit → reset
  (204) → login returned `"role":"ADMIN"`, and the token decoded to the bootstrapped `sub`.
  Restarted twice more, once with a different address: both skipped, still one row.
- Confirmed step 9's three failure paths: an invalid or non-NUS address stops the boot with a
  message naming the variable and exit code 1; an unset variable boots normally and inserts
  nothing; demoting the only admin then restarting produced the "No ACTIVE admin exists" warning.
- Confirmed the tests actually catch what they claim, by breaking the service on purpose each
  time. Steps 5–8: removing the decoy record, letting the mail 503 through, dropping the status
  check, moving the lockout clear before the commit. Step 9: skipping normalisation, accepting a
  non-NUS address, putting the address in the audit event, running the no-admin query on the
  success path. Each failed the matching test and only that one.
- Grepped the service and startup logs for a plaintext `u.nus.edu` address: none.

**Mistakes worth recording.**

- A mutation written as `if (false)` stopped the file compiling, so Jest reported `Tests: 0 total`
  and that briefly read as "nothing caught it". A mutation has to stay compilable to prove
  anything. It happened twice, in step 8 and again in step 9.
- One `npm test` run reported 2 failures in 1 suite and was never reproduced — 11 later runs,
  including under CPU load, were clean, and the suite name was not captured. Recorded here rather
  than treated as fixed.

**Review findings acted on.** One finding on PR #15 (account creation and session issuance were
not atomic) — fixed by wrapping the insert and the first refresh token in one transaction, with a
test. One CodeQL alert (`js/insufficient-password-hash` on `hashOtp`) was a false positive: the
"password" it saw is the literal enum member name `PASSWORD_CHANGE`. Traced every call site before
dismissing it.

<!-- TODO Zi Yi: confirm the PR numbers in the heading — #17 and #18 were guessed before GitHub
     assigned them. -->

---

## Deanson

### 2026-09-28 — Step 13: admin reactivation (branch `feature/user-service-protected-endpoints`, PR not yet opened)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** explain, generate, verify

**Files:** `user-service/src/users/users.repository.ts`, `user-service/src/users/admin.service.ts`,
`user-service/src/users/admin.controller.ts`, `user-service/src/users/admin.service.spec.ts`,
`user-service/AGENTS.md`, `user-service/README.md`,
`user-service/postman/user-service.postman_collection.json`, `/ai/usage-log.md`

**Scenario.** Continuing Person B's track after Step 12: `POST
/admin/users/:userId/reactivate`, the admin-side reverse of Step 12's self-deactivate. Had it
read `AGENTS.md`, `README.md` and the existing admin/users code first, then plan before writing
anything. It surfaced one implementation question `AGENTS.md` doesn't answer — whether
reactivate should re-verify the caller's admin status fresh from the database (the way
`changeRole`/`deactivateSelf` do via `AdminLockService`, per `roles.guard.ts`'s note that a
demoted admin's token stays valid up to 15 minutes) — as a multiple-choice question rather than
assuming an answer. I also separately decided to defer Step 14 (`GET /internal/users/:userId`)
since its only caller, the Notification Service, doesn't exist yet.

**Prompts (exact):**

> I am person b (Deanson), implementing user service. Read the AGENTS.md, README.md and other
> relevant files under /user-service folder to get a better understanding.

> What is step 14 and step 15 about respectively.

> Skip step 14 for now, edit AGENTS.md as a note, we probably only implement it once we have
> notification service up.

> Go ahead and implement step 13, including adding relevant tests to postman collections. After
> you are done, list the files you added / edited. DO NOT proceed to subsequent steps (step 15)
> without my permission

> u don't have to test it via docker compose. Let me do it instead. Are you done with this
> endpoint?

> Give me the steps to test this endpoint via Postman

> I tested the following via Postman.
> - Reactiviating an activated account, rejected (account must be deactive 409)
> - Rectivating using a user account, rejected must be admin role (403)
> - Reactivating a user that doesnt exist (404)
> - no access token -> 401 (the token is invalid or has expired)
> - happy path (deactivatied account became active again)
>
> Step 13 looks all good to me. Update the relevant files such as usage-log.md,
> user-service/AGENTs.md as well as other relevant files.

(The choice of whether to re-verify the caller's admin status inside a lock was resolved
through a multiple-choice question rather than free text — recorded under "Decisions I made"
below, not paraphrased here as a prompt.)

**What it produced:** `UsersRepository.reactivate`, `AdminService.reactivate` (404 `NOT_FOUND`,
409 `NOT_DEACTIVATED`, `ADMIN_ACTION` audit log), the `POST :userId/reactivate` route, three new
`admin.service.spec.ts` tests (happy path, 404, 409), the `AGENTS.md`/`README.md` build-order
and endpoint-table updates, and a "Reactivate user (admin)" Postman request plus fixes to two
other descriptions in that collection that referenced Step 13 as not-yet-built.

**Decisions I made, which it did not:**

- **No re-verification of the caller's admin status inside a lock for `reactivate`.** It laid
  out three options (reuse `AdminLockService.run` for consistency at the cost of locking every
  active-admin row unnecessarily; a lighter fresh re-read of just the caller's row; or trusting
  `RolesGuard`'s token-based check only, same as `GET /admin/users`). I picked the third: this
  endpoint only ever activates someone, so it can never break the last-admin invariant, and a
  demoted admin's stale token reactivating an account for up to 15 minutes isn't the same class
  of risk as a stale token demoting or promoting someone.
- **Step 14 deferred**, not built now — its only consumer doesn't exist yet.

**Verification:** `npm run build` (clean) and `npm test` (271/271, no regressions) after the
code change. I then manually verified `POST /admin/users/:userId/reactivate` via Postman
against the compose stack myself: reactivating an already-ACTIVE account is rejected with 409;
calling it with a USER-role token is rejected with 403; an unknown `targetUserId` gets 404; no
access token gets 401 (`TOKEN_INVALID`, "the token is invalid or has expired"); and the happy
path (a DEACTIVATED account becomes ACTIVE again) works. All five matched what
`admin.service.spec.ts` asserts.

---

### 2026-09-28 — Step 12: the six OTP-protected self-service endpoints (branch `feature/user-service-self-profile`, PR not yet opened)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** explain, generate, debug, verify
**Files:** `user-service/src/auth/auth.schemas.ts`, `user-service/src/users/users.schemas.ts`,
`user-service/src/users/users.repository.ts`, `user-service/src/users/users.service.ts`,
`user-service/src/users/users.controller.ts`, `user-service/src/users/users.service.spec.ts`,
`user-service/src/otp/otp.scripts.ts`, `user-service/src/otp/otp.service.ts`,
`user-service/src/otp/otp.service.int.spec.ts` (all existing files, no new ones — see "What I
changed or rejected" on file organisation), `user-service/AGENTS.md`, `user-service/README.md`,
`user-service/postman/user-service.postman_collection.json`

**Scenario.** Continuing Person B's track after Step 11: `POST /users/me/otp`, `POST
/users/me/email` + `/email/verify`, `PATCH /users/me/mobile`, `POST /users/me/password`, `POST
/users/me/deactivate`. Had it read the existing code and explain the OTP storage/consumption
mechanics before any code was written, settled two design points as clarifying questions, then
implemented and manually verified — then, in a follow-up review of exactly when each code is
spent, the literal version of a change I asked for turned out to open a security hole, which
got caught and redesigned before I implemented it.

**Prompts (exact):**

> I am person B (Deanson) implementing user service. Read /user-service AGENTS.md, readme.md and
> all relevant files under user-service.

> DOn't implement anything yet. Tell me your plan for step 12, let's ensure we are on the same
> page.

> 1. How are OTPs stored currently?
> 2. what do u mean by 'consume' in this context
> 3. new password must differ from current
> 4. I rather you just fold the modules in instead of name it self-service.controller etc,
> because it may be confusing.

> Go ahead and implement step 12 as accordingly to what we discucsed. After you are finished,
> state the files / functions you edited or changed for each endpoint. DO NOT start on step13
> without my permission.

> Run through the flow of a user wanting to change their email

> Run through the flow for account registration. I just want to compare the flow.

> I checked the corresponding files and code. It will looks okay. I will now proceed with
> testing via Postman.

> I don't think step 10's requests is in the collection?

> Add step 10 and step 12 to the collection

> under each /me/email or mobile or password, what currently happens when an expired otp is used

> flag step 12 with a note saying that 3 OTP requests limit per 10min may need to be
> reconsidered since user might change multiple fields consecutively in AGENTS.md

> For each data flow (email, mobile and password). Tell me when an OTP is consumed

> For /POST /users/me/email, we should only consume the code after we run our verification such
> as if the email is valid and that if the email is unique
> For /POST/users/me/password, we should only consume the code after we run our verification
> such as the new password passes the correct length and format as well as that it is different
> from the previous password
>
> Clarify that you understand.

> Continue

> how many times is correctness checked for in terms of limit?

> on password change, are all refresh tokens invalidated?

> I have tested step 12's all endpoints on postman, everything looks good. help me edit the
> corresponding files including usage-log.md, agents.md and other relevnt files to reflect this
> progress

(Two design points were resolved through a multiple-choice question rather than free text —
recorded under "Decisions I made" below, not paraphrased here as prompts.)

**What it produced:** the six endpoints and their Zod schemas, repository methods
(`updateEmail` — including translating the Postgres 23505 unique-violation into 409
`EMAIL_TAKEN` — `updateMobile`, `deactivate`), the constructor wiring, a full rewrite of
`users.service.spec.ts`'s mocks and new test coverage, two Postman flow walkthroughs (email
change vs. registration) on request, and — after I asked when each OTP is spent and then asked
to defer that point past validation — a new non-consuming check primitive in `OtpService`
(`check`/`checkRecord`, backed by a new `CHECK_OTP_LUA`) plus the redesigned
`requestEmailChange`/`changePassword` methods and their disclosure headers.

**Decisions I made, which it did not:**

- **Self profile shape for `PATCH /users/me/mobile` and `POST /users/me/email/verify`** —
  resolving the `[Open]` item AGENTS.md had left for exactly this, in favour of consistency with
  Step 11 over the endpoint table's literal (admin-facing) shape.
- **Fold everything into the existing `users.controller.ts`/`users.service.ts`/
  `users.schemas.ts`** rather than the separate `self-service.*` pair it first proposed —
  simpler file layout, at the cost of those two files now covering both Step 11 and Step 12.
- **Extend the "must differ from current password" check to `changePassword`**, even though
  AGENTS.md only documents that rule for password *reset* — for consistency between the two
  places a password gets set.
- **Defer spending the `EMAIL_CHANGE`/`PASSWORD_CHANGE` code until after the endpoint's own
  business check passes**, so a rejected `EMAIL_TAKEN`/"must differ" doesn't cost the user their
  code — the request that started the security discussion below.
- Given the choice, once the risk was flagged (below): **"verify-then-conditionally-consume"
  over a plain reorder**, and applied it to *both* endpoints for consistency rather than only
  the higher-risk one (password).
- Added the OTP-rate-limit note to AGENTS.md's `Open` section myself, having noticed the
  three-per-ten-minutes bucket is shared across every Step 12 purpose and a user changing
  several fields in one sitting could hit it legitimately.

**AI-proposed, and I adopted after reading the reasoning:**

- **The whole "verify-then-conditionally-consume" design** (`OtpService.check`/`checkRecord`,
  `CHECK_OTP_LUA`, explicit `discard()`). I'd asked for the literal version — move the business
  check before the OTP check — and it flagged that this would let anyone holding a valid access
  token (including a leaked one) probe `changePassword`'s reuse check as a free
  password-guessing oracle, with no rate limit and no lockout, since `changePassword` calls no
  request-limiter of its own. It proposed keeping the correctness check first (closing that
  hole) but not deleting the record on a match until the business check also passes, so I still
  get "a rejected check doesn't cost a code" without the oracle. I confirmed this via its
  AskUserQuestion for both the password and (for consistency) the email endpoint.
- **Flagged that Step 10's admin endpoints were never actually in the Postman collection**,
  despite `admin.controller.ts`/`admin.service.ts`'s own disclosure headers claiming they were
  Postman-verified — the verification evidently happened with ad hoc requests that were never
  saved back into the shared file. I asked it to add both Step 10 and Step 12 to close the gap.

**What I changed or rejected:** the literal form of my own OTP-consumption request (see above) —
not code the AI generated unprompted, but a design I asked for that got substantively revised
after it identified the oracle risk, before any code was written against it.

**Verification.**
- `npm run build` (clean) and `npm test` (267/267, 19 suites).
- `npm run test:int` (50/50) against a real Redis (`docker compose up -d user-redis`), including
  new coverage for `check()`/`discard()`: a correct code survives a `check()` without being
  deleted, the same code can be checked again, `discard()` is what actually removes it, and the
  attempt cap/`KEEPTTL` behaviour on a wrong guess is unchanged from `verify()`.
- I tested all six Step 12 endpoints via Postman against the compose stack myself and confirmed
  they work as expected.

### 2026-09-28 — Step 11: GET /users/me, PATCH /users/me (branch `feature/user-service-admin-endpoints`, PR not yet opened)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** explain, generate, debug, verify
**Files:** `user-service/src/users/profile.mapper.ts`,
`user-service/src/users/profile.mapper.spec.ts` (new), `user-service/src/users/users.repository.ts`,
`user-service/src/users/users.schemas.ts`, `user-service/src/users/users.controller.ts` (new),
`user-service/src/users/users.service.ts` (new), `user-service/src/users/users.service.spec.ts`
(new), `user-service/src/users/users.module.ts`, `user-service/AGENTS.md`,
`user-service/README.md`, `user-service/postman/user-service.postman_collection.json`

**Scenario.** Continuing Person B's track after Step 10: Step 11 (`GET /users/me`,
`PATCH /users/me`), the first of the self-service profile endpoints. Had it read the existing
code first, then discussed and settled two response-shape/auth points before any code was
written, then implemented, then manually verified.

**Prompts (exact):**

> I am person B implementing user service. I am Deanson. Under the user-service, read
> AGENTS.md, README.md and all relevant files.

> Let's discuss the plan together first before implementing anything.

> Remove GET/user/:userId, if needed, we can always add on query/params to GETadmin/users.

> Let's focus on discussing step 11 purely.

> Stop. Based on purely AGENTS.md, let's discuss step 11 which is to implement GET /users/me,
> PATCH /users/me.
>
> Under the GET endpoint, we can return all fields except the user's password, created_at /
> updated_at and deactiviated_at, status and role.
> Under the patch endpoint, no authentication is required, the user is only allowed to change
> their name under this endpoint.
>
> Ask me any clarifying questions.

> Do the following, edit the current AGENTS.md accordingly based on the discussed plan.

> Let's start on step 11. after finishing implementing the two endpoints. List the files /
> functions added for each endpoint. DO NOT go on to step 12 without my approval.

> so selfprofielresponse is for our public endpoint while toprofielresponse is reserved for
> admin ednpoints?

> Tell me the steps to test both endpoints on postman.

> Can I clarify that the the register endpoint pre-checked that a user's display name is
> unique?

> flag non-unique display_name under step 11 in agents.md just as a note

> I ran tests through Postman, step 11 looks good. Edit usage-log.md, agents.MD and other
> relevant files accordingly.

**What it produced:** a walkthrough of the existing codebase and design questions before any
code; then, once the two shape/auth questions below were settled, the implementation —
`toSelfProfileResponse`/`SelfProfileResponse` in `profile.mapper.ts` (with `toProfileResponse`
refactored to build on it rather than duplicate the decrypt calls), `UsersRepository.
updateDisplayName`, `UpdateSelfProfileSchema`, the new `UsersController`/`UsersService` pair,
module wiring, two new spec files, the AGENTS.md/README updates, and two new Postman requests.

**Decisions I made, which it did not:**

- **Dropped `GET /users/:userId` from Step 11 entirely.** AGENTS.md's documented table had it
  as a third endpoint of this step; I cut it because a by-id lookup, if it's ever needed, is a
  filter on `GET /admin/users` instead — no separate route.
- **`PATCH /users/me` needs no OTP, but still requires the JWT.** My first phrasing ("no
  authentication required") was ambiguous with dropping the JWT guard entirely; it flagged the
  contradiction with the route sitting under `JwtAuthGuard` and the "Logged in" section, and I
  confirmed I meant no OTP step only.
- **`GET /users/me`/`PATCH /users/me` return a narrower "self profile" shape** — no `role`,
  `status` or `createdAt` — distinct from the admin-facing `Profile` shape `GET /admin/users`
  still uses. This is a documented interface change, so it's recorded in AGENTS.md, not just in
  this log.
- Found, independently of anything it proposed, that `display_name` has no `UNIQUE` constraint
  and `PATCH /users/me` does not check for a duplicate name; had it flag this as a note in
  AGENTS.md rather than silently accept the gap.

**What I changed or rejected:** none of the generated code itself; the two design decisions
above were resolved as clarifying questions before code was written, not corrections after.

**Verification.**
- `npm run build` (clean) and `npm test` (237/237, 19 suites — the two new spec files pass and
  the rest of the suite is unaffected).
- Manually verified both endpoints via Postman against the compose stack: `GET /users/me`
  returns exactly `{ userId, displayName, email, countryCode, mobileNumber }` with no
  `role`/`status`/`createdAt`; `PATCH /users/me` renames the caller and a follow-up `GET`
  reflects the new name; a body with an extra field (e.g. `role`) is rejected 400 by the
  `.strict()` schema; a missing token gets 401.

### 2026-09-27 to 2026-09-28 — Step 10 endpoint 2: PATCH /admin/users/:userId/role (branch `feature/user-service-admin-endpoints`, PR not yet opened)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** generate, explain, debug, verify
**Files:** `user-service/src/users/admin-lock.service.ts` (new),
`user-service/src/users/admin-lock.service.spec.ts` (new),
`user-service/src/users/admin.service.spec.ts` (new), `user-service/src/users/admin.service.ts`,
`user-service/src/users/admin.controller.ts`, `user-service/src/users/users.repository.ts`,
`user-service/src/users/users.schemas.ts`, `user-service/src/users/users.module.ts`

**Scenario.** Continuing Step 10 after endpoint 1 (previous entry below): the role-change
endpoint and its shared last-admin lock. Had it walk through and explain the design before
writing code, asked clarifying questions on three specific ambiguities, then implemented, then
manually verified.

**Prompts (exact):**

> Run though ur plan of implementing this endpoint

> Summarize endpoint 2 plan

> Explain the logic behind implementing this endpoint

> Explain AdminLockService

> Ask me any clarifying questions before proceeding

> Continue to implement step 10 endpoint 2. When you are done, do the following:
> - List the files you have edited

> when and where is AdminLockService ran?

> {{baseUrl}}/admin/users/82663fb1-e431-4750-9f38-c8b5585b9bd3/role
>
> is this not the correct endpoint?

> Give me the steps to test endpoint 2

> What's the steps to test endpoint 2 via postman

> just tell me verbally

> how to register Alex?

> I tested the endpoint via Postman. Update usage-log-md, AGENTS.md and other relevant files,
> marking step 10 as complete

(Also asked it to explain, separately and without changing any code, two existing files —
`auth/decorators.ts` and the JWT-extraction chain in `auth/jwt-auth.guard.ts` — while getting
oriented; omitted here since nothing was generated or changed by those.)

**What it produced:** the design for `AdminLockService` (locks the caller row, then
conditionally the full active-admin set, inside one transaction) and `AdminService.changeRole`'s
branch logic; the three new repository methods, the `ChangeRoleSchema`, the route, the module
wiring, and two new spec files (`admin-lock.service.spec.ts`, and the first-ever
`admin.service.spec.ts`, which also backfilled coverage for the already-shipped `listUsers`).

**What I changed or rejected:**
- Three clarifying-question decisions, picking: `ParseUUIDPipe` for a malformed `:userId`
  (400, not folded into 404); a true short-circuit for the self-reaffirm no-op (no DB write, no
  audit log — not just "don't error"); and backfilling `listUsers` test coverage now rather
  than leaving it out of scope.
- **Caught a real logic bug that its own tests did not.** While working out how to manually
  demonstrate `LAST_ADMIN` for the test plan, realised the branch could never fire: the check
  compared the locked active-admin list against a target that, by construction, can never be
  its sole entry unless the target is the caller — but self-targeting was already routed to
  `CANNOT_MODIFY_SELF` earlier in the same function, every time. The two unit tests that
  supposedly covered `LAST_ADMIN` only passed because they hand-constructed a mock state
  (`activeAdminIds` excluding the caller) that `AdminLockService` can never actually produce —
  they asserted a scenario, not the real invariant. Had it explain the flaw back to me, confirm
  the fix (move the sole-admin check into the self-demotion branch, since AGENTS.md's own
  reasoning for `CANNOT_MODIFY_SELF` — "another admin must do it" — stops applying once you
  *are* the only admin), and rewrite the two invalid tests against a realistic mock state.

**Verification.**
- `npm run build` (clean) and `npm test`: the two new spec files pass 17/17; the rest of the
  suite is unaffected by this branch — the 2 pre-existing `jwt.service.spec.ts` failures were
  confirmed via `git stash` to already fail on the base branch (environment leakage between
  test files sharing a Jest worker, once `.env` holds real generated keys — unrelated to this
  work, not investigated further here).
- Manually verified `PATCH /admin/users/:userId/role` via Postman against the compose stack:
  promoted a USER to ADMIN (200, `ADMIN_ACTION` logged); self re-affirm is a true no-op (200,
  unchanged profile, confirmed no new `ADMIN_ACTION` log line); self-demote with another admin
  present → `CANNOT_MODIFY_SELF`; demoting a distinct admin succeeds; self-demote as the sole
  admin → `LAST_ADMIN` (the exact branch the bug had hidden — confirmed this is a genuinely
  different response from the `CANNOT_MODIFY_SELF` case, not just different in the source);
  404 for a nonexistent id; 400 for a malformed UUID and for an invalid `role` value; 403 for a
  non-admin token; 401 for a missing and for a garbage token. All passed.

### 2026-09-27 — Step 10 planning and GET /admin/users (branch `feature/user-service-admin-endpoints`, PR not yet opened)

**Tool:** Claude Code (Claude Sonnet 5) · **Mode:** explain, generate
**Files:** `user-service/src/users/users.schemas.ts` (new), `user-service/src/users/profile.mapper.ts` (new),
`user-service/src/users/admin.service.ts` (new), `user-service/src/users/admin.controller.ts` (new),
`user-service/src/users/users.repository.ts`, `user-service/src/users/users.module.ts`

**Scenario.** I own Person B's track (profile/admin endpoints, Steps 10–14 of
`user-service/AGENTS.md`'s build order), which was entirely unimplemented. Used Claude Code
first to get oriented on what was already built, then to plan Step 10 (`GET /admin/users`,
`PATCH /admin/users/:userId/role`) in detail before writing any code, then to implement only
the first endpoint (`GET /admin/users`) so I can verify it manually via Postman before the
second.

**Prompts (exact):**

> Read agents.md and readme.md and get the sense of the current's project's progress

> I am person B, let's go through the plan together and what to implement and ensure we are on
> the same page. DO NOT start on phase 2 at all.

> Run me through the steps of how you plan to implement step 10. What endpoints, what you plan
> to do under each endpoint including payload and response. Afterwards, let me know how I shall
> test it.

> - All four filters (role, status, email) are optional; page/pageSize default to 1/20 if
> omitted. How did you figure this?

> Don't implement yet.
> - For GET /admin/users, only filter by role and status. no pagination needed as of now

> Go ahead and implement step 10 for me. Start with endpoint 1. Do not start with endpoint 2
> until i have finished verifying and testing endpoint 1.

> I am person B and implementing User service. Read AGENTS.md, README.md, sessions folder
> under the user-service folder as well as other relevant files under the user-service folder.
> After you get a better understanding, pause and wait for the next instruction from me.

> steps to test endpoint 1 for step 10

> Let me be the one testing it via Postman. Give me the instructions

> [pasted user-service container log line showing ADMIN_BOOTSTRAPPED] Can you confirm mail
> service is up. not getting an email

> I have verified endpoint 1, all is working well. Document it under usage-log.md and other
> relevant files.

**What it produced:** a written plan for Steps 10–14 (repository methods, the shared
last-admin-lock service, service/controller split, Zod schemas, module wiring), cross-checked
against the actual source rather than taken on faith; then, scoped to endpoint 1 only, a new
`listUsers` repository method, `toProfileResponse` mapper, `AdminService`, and `AdminController`
gated by the existing global `@Roles('ADMIN')`/`RolesGuard`. Later in the same branch: a
Postman/curl test plan for `GET /admin/users` (happy path, `role`/`status` filters alone and
combined, `.strict()`-schema rejection of an unknown `email` param and of an invalid `role`
enum value, 403 for a non-admin, 401 for no/garbage token), and help diagnosing a "not
receiving the OTP email" report.

**What I changed or rejected:**
- Rejected the AI's first draft of `GET /admin/users`, which assumed pagination and an
  `email`-hash filter because AGENTS.md's endpoint table lists them; I cut both — filters by
  `role`/`status` only, response is `{ items }` with no `page`/`pageSize`/`total`. This is a
  deliberate deviation from AGENTS.md's documented shape, not yet reflected back into that file.
- Had it confirm, rather than assume, that nothing in `AGENTS.md` grants it authority to commit
  on my behalf — it does not; commits remain something I trigger explicitly each time.

**Verification:** `npm run build` (clean) and `npm test` (213/213, 15 suites, no regressions)
after the code change. Manually verified `GET /admin/users` via Postman/curl against the
compose stack: happy-path listing, `role` and `status` filters (individually and combined),
an unknown `email` query param and an invalid `role` value both rejected with 400 (confirms
the `.strict()` schema and the deliberate no-pagination/no-email-filter scope cut), a non-admin
token gets 403, and a missing or invalid token gets 401. All passed. Along the way, resolved
confusion where OTP "reset password" emails weren't visibly arriving: Mailpit intercepts all
outbound SMTP in dev and never delivers to a real inbox, so the bootstrap admin's real-looking
`@u.nus.edu` address had its codes sitting in the Mailpit web UI (localhost:8025) rather than
any real mailbox — not a service outage.

## Cole Lin

### 2026-09-29 — Coordinate search, dev-mode fix and these log entries (PR #33)

- Tool and mode: Claude Code (Claude Opus 5), generate and debug.
- Usage scenario: Close the "finding suppliers by location" gap in D2 Supplier point 2, then have the whole Supplier change set reviewed before pushing it.
- Prompts (exact):
  - "add the finding suppliers by location, given a coordinate. Just assume it will be a standard mobile gps location format"
  - "we changed a lot with this, I want you to check through and figure out if its all good"
  - "do 2 and 8" / "wait revert 8"
- Key response: Asked how the coordinate should select results before writing anything, then added `lat`/`lon` (decimal degrees, given together), a `distance_m` field in whole metres computed in SQL, and `order=distance`. The review afterwards found that `SUPPLIER_JWKS_URL` was still required in dev-auth mode, which would have stopped the service running standalone.
- What I changed or rejected: Rejected a radius filter and a "nearest N" cap — a coordinate adds distance and allows distance ordering, nothing more. Asked for the seeded image links to be served from our own repository copy, then decided against it and had it reverted, so the loader still rewrites the template repository's links. Left ordering by type or building pending.
- Verification: Ran the coordinate queries in Postman against the seeded database, and checked the 400 cases for `lat` without `lon` and for `order=distance` with no coordinate.

### 2026-09-28 — Verify User Service tokens, with an opt-in dev fallback (PR #30)

- Tool and mode: Claude Code (Claude Opus 5), generate and debug.
- Usage scenario: Replace the Supplier Service's placeholder auth. The gateway forwards the token and injects no identity headers, so this service has to verify the JWT itself.
- Prompts (exact):
  - "ok so for API gateway stuff, right now I believe we have sort of a placeholder, but we should be able to flesh it out now that we know how the gateway is implemented right?"
  - "ok ask me the questions I want to pick it up now" — then chose: hand-rolled `node:crypto`; remove the dev headers; check issuer and audience only when configured; test with local keys.
  - "ok I actually now want to be able to test supplier alone, add back the dev-only X-User-Id / X-User-Role headers and make sure no security problems, only for testing"
- Key response: `src/common/jwks.ts` with JWKS fetching, caching and RS256/ES256 verification, the guard swapped to read `sub` and `role` from the token, and `SUPPLIER_DEV_AUTH` accepted only when no bearer token is sent.
- What I changed or rejected: Rejected adding the `jose` package and rejected copying the gateway's verification file into this service; chose hand-rolled `node:crypto` so there is no new dependency. First had the dev headers removed entirely, then reinstated them behind a flag once it was clear D2 point 3 needs the service testable on its own — with the rule that a real token always wins, the flag is off by default, and startup refuses it when `NODE_ENV=production`.
- Verification: Read it in full, ran it with Postman and checked the 401 and 403 cases, including that the dev headers are ignored when the flag is off and cannot override a real token.

### 2026-09-28 — A-Z / Z-A sorting and the service Dockerfile (PR #28)

- Tool and mode: Claude Code (Claude Opus 5), generate.
- Usage scenario: Add the sorting D2 point 5 lists, and give the Supplier Service the Dockerfile every service needs for the containerised demo.
- Prompts (exact):
  - "add sorting A->Z and Z<-A"
  - "i thinking of making our dockerfile" — then chose: build from the repo root, ports 3002 and 5433, Dockerfile now with the compose entry later.
- Key response: `order=asc|desc` on `name`, rejecting any other value with 400, and a two-stage `node:22-alpine` build following `user-service/Dockerfile`, with a root `.dockerignore`.
- What I changed or rejected: Rejected mounting `data/` into the container and rejected keeping a second copy of the seed CSV inside the service folder; chose the repo-root build context so the image copies `data/csv` in. Deferred the `compose.yaml` entry rather than conflicting with PR #9, which creates that file.
- Verification: Built the image and ran the container against PostgreSQL, checking the seed loads from inside the image and that a restart does not seed again.

### 2026-09-22 — Supplier Service: first implementation (PR #7)

- Tool and mode: Claude Code (Claude Opus 5), generate.
- Usage scenario: Build the service from the design the team had already settled in `supplier-service/AGENTS.md`: schema, endpoints, error codes and seed rules were decided in conversation first, then implemented.
- Prompts (exact):
  - "ok are you able to start building it such that I can test with seed and postman first?" — then chose: NestJS; `pg` with plain SQL; a dev-only role header for testing; JSON field names matching the columns.
  - "the Supplier Service files and .env.example together, leaving out the other services' AGENTS.md files is perfect and exactly what I was thinking"
  - "push it and open a PR"
- Key response: The NestJS service (config, database module, Problem Details filter, guard, Zod schemas, locations controller and service, CSV seed loader), a Postman collection and the README.
- What I changed or rejected: Rejected Prisma, Drizzle and Knex in favour of plain parameterized SQL. Decided hours are stored as minutes but entered and searched as `HHMMhrs`, and that a location's opening and closing times are both present or both absent. Kept change history, the created and last-modified timestamps and the campus-boundary check out of this first version, and recorded them as pending in `AGENTS.md`.
- Verification: Ran it with Postman against PostgreSQL in Docker: the seed loads all 21 locations, CRUD and search work, and the 401 and 403 cases behave as documented.

## Jian Bing

### 2026-09-29 — Supplier Service Docker Compose file (PR #33)

- Tool and mode: Claude Code (Claude Opus 5.5), generate.
- Usage scenario: The Supplier Service had a Dockerfile but no compose file, so the root `compose.yaml` could not start it (D2 containerised demo).
- Prompts (exact):
  - “does the suppleir service have any docker compsoe file”
  - “okay draft it out on the most udpated supplier service pr”
  - A pasted draft compose file from Jie Yang (Codex, GPT-6) with Jie Yang's message: “u can jjs” / “add the env”
- Key response: Follow `user-service/compose.yaml`: its own `supplier-db`, the image built from the repository root, and inclusion from the root `compose.yaml`. From Jie Yang's draft, took the separate `SUPPLIER_POSTGRES_PASSWORD` and host port 5434. Did not take `depends_on: user-service` (it lives in another included file, so the Supplier file could not run on its own, and the JWKS is fetched per request anyway).
- Output: `supplier-service/compose.yaml`, the `include` in `compose.yaml`, `SUPPLIER_POSTGRES_PASSWORD` in `.env.example`, and a "Run with Docker Compose" section in `supplier-service/README.md`. The first draft passed the whole `.env` to the container; changed to pass only the Supplier variables, because it leaked user-db's password into the Supplier container.
- Verification: in an isolated compose project with test secrets, standalone: 21 locations seeded, 401 without a token, 503 for a token (no User Service), dev headers ignored, data kept across `down`/`up`. Whole stack: the Supplier container fetched the User Service's JWKS; tokens signed with its key got 200 (USER), 403 (USER on `includeInactive`), 200 (ADMIN), and 401 when signed with another key.
- Human review: Pending on PR #33.

### 2026-09-29 — Diagnose SoCLaaS review failures and add a TLS stopgap (PR #36)

- Tool and mode: Claude Code (Claude Opus 5.5), debug and generate.
- Usage scenario: Every SoCLaaS PR Review run failed with "SoCLaaS could not be reached" while the API still loaded in a browser. Used AI to find the cause and add a temporary workaround.
- Prompts (exact):
  - “why is soclass not working?” (with screenshots of the failed run and the API URL)
  - “tyr the stopgap for the soclass o na different branch, but before you do, help me to settle this merge conflict on pr #27”
  - “resolve this for pr 27, then open the pr for fix soclass tls”
  - “okay the mcp is working now, read the review form codesx and resolv eth econversations accoridngly, then do the same with PR30 for user service”
  - “for pr 36 this was commented by codex” (with a screenshot of Codex's finding that Python 3.13+ enables `VERIFY_X509_PARTIAL_CHAIN` by default)
- Key response: After its 2026-09-28 certificate renewal, the SoCLaaS server sends only its leaf certificate. Browsers fetch the missing Let's Encrypt `YE2` intermediate themselves; Python's `urllib` does not, so the reviewer fails TLS verification and reports the service as unreachable.
- Output: `SOCLAAS_INTERMEDIATES` (the `YE2` and `Root YE` certificates) and an SSL context for SoCLaaS requests only in `.github/scripts/soclaas_review.py`; certificate verification stays on. After Codex's review, the context also clears `VERIFY_X509_PARTIAL_CHAIN`, which Python 3.13+ sets by default and which let the embedded certificates act as trust anchors (confirmed on 3.14: accepted with no system roots before the fix, rejected after). Tested locally against the live server on Python 3.11, 3.12 and 3.14.
- Human review: Reviewed the diagnosis and chose the stopgap over waiting for the SoCLaaS admins. Still to confirm after merge: a SoCLaaS review re-run succeeds. Revert once the server serves its full chain.

### 2026-09-29 — Fix review findings on the Supplier Service JWT verification (PR #30)

- Tool and mode: Claude Code (Claude Opus 5.5), debug.
- Usage scenario: Address Copilot's review findings on PR #30 (lihloway's branch) in `supplier-service/src/common/jwks.ts` and `supplier-service/src/config.ts`.
- Prompts (exact):
  - “okay the mcp is working now, read the review form codesx and resolv eth econversations accoridngly, then do the same with PR30 for user service”
  - Plan approval, chosen from the options Claude offered: “Approve all 3 fixes (Recommended)”
- Key response: Three findings were real bugs: an invalid or `null` JWKS body escaped as a 500 instead of the documented 503; concurrent requests each fetched the JWKS, defeating the 30-second refetch limit; and `SUPPLIER_JWKS_URL` was required even in the documented dev-auth-only mode. Claude flagged the third fix as a security trade-off before making it. The fourth finding (the original author's disclosure and log entry) was left for lihloway.
- Output: Guarded JSON parsing and body validation, one shared in-flight JWKS fetch, and a JWKS URL that is optional only when `SUPPLIER_DEV_AUTH=true` (a bearer token then gets 503, never accepted unverified). Checked with a throwaway script against a fake JWKS server: all three bugs reproduced before the fix and passed after it; `npm run build` succeeds.
- Human review: Approved the fix plan, including the dev-auth trade-off. Code review pending on PR #30.

### 2026-09-28 — Follow-up: scan PRs targeting any branch

- Tool and mode: Codex (GPT-6), generate.
- Usage scenario: Extend the CodeQL setup above to cover feature-to-feature pull requests, including stacked changes.
- Prompts (exact):“lets alter the current codeQL configuration from the current only main prs to now also include pr-to-pr”
- Key response: “I’ll expand CodeQL to scan PRs targeting any branch, keep the existing merge protection on `main`, and open a PR for the change.”
- Output: Removed the `pull_request.branches` filter from `.github/workflows/codeql.yml`; main push scans and the weekly schedule are unchanged.
- Human review: Pending for this follow-up change.

### 2026-09-28 13:08 UTC — CodeQL advanced setup

- Tool and mode: Codex (GPT-6), generate and debug.
- Usage scenario: Configure CodeQL analysis for public fork pull requests while continuing to scan JavaScript/TypeScript and GitHub Actions.
- Prompts (exact): “assist me in configuring a more advanced version of codeQL workflow for me to customize”
- Key response: “I’ll configure the CodeQL workflow for pull requests, then switch GitHub from default to advanced setup and check whether PR #7 receives a scan. I’ll inspect the repository settings and existing workflow first.”
- Output: `.github/workflows/codeql.yml` in PR #23.
- Human review: Initial setup approved by Jyang1206 and merged in PR #23. The CodeQL jobs ran successfully after the repository switched to advanced setup.

## Jie Yang

<!-- Add your entries here. -->
