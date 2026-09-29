<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Recorded the CodeQL workflow configuration and expanded pull request coverage.
Author review: Initial setup approved in PR #23; expanded PR coverage pending human review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Moved the CodeQL entries under the Jian Bing section when merging main into PR #27; entry text unchanged.
Author review: Pending human review on PR #27.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Wrote the SoCLaaS TLS stopgap entry under the Jian Bing section (PR #36).
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review on PR #36.
Scope: Wrote the PR #30 review-fix entry under the Jian Bing section.
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review on PR #30.
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Combined the main-branch log with the User frontend integration entries.
Author review: Pending team review.
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

<!-- Add your entries here. -->

## Jian Bing

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

### 2026-09-29 13:07 SGT — Merge main into frontend User Service integration

**Tool:** Codex (GPT-6) · **Mode:** refactor, explain
**Files:** `ai/usage-log.md`; other files came from the existing `main` commits without AI edits during this merge.

**Scenario:** Merge the latest main branch, which includes the User Service implementation, into the frontend User Service integration branch and preserve both sides of the shared usage log.

**Prompt (exact):**

~~~text
pull main into this branch, it should contain the user service implementation
~~~

**What it produced:** Merged `origin/main`; combined the User Service team's entries and the CodeQL entry from main with the frontend and gateway entries from this branch.
**What I changed or rejected:** Pending human review. No service code was changed while resolving the log conflict.
**Verification:** Checked for conflict markers, confirmed both teams' entries and the User Service files, and recorded the merge status in the handoff.

### 2026-09-29 12:58 SGT — Refresh-only logout revocation

**Tool:** Codex (GPT-6) · **Mode:** generate, debug
**Files:** `frontend/app/api/session/logout/route.ts`, `frontend/lib/protected-gateway.ts`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`

**Scenario:** Revoke a User Service refresh session at logout after the shorter-lived access cookie has expired, while always clearing browser cookies.

**Prompt (exact):**

~~~text
Use the refresh token once to obtain a new access token and **rotated** refresh token, then send both required credentials to User Service’s logout endpoint. The browser cookies should still be cleared if either call fails.
~~~

**What it produced:** Exposed the existing in-flight refresh coordinator to logout, used the rotated access and refresh tokens for remote logout when no access cookie remains, and added success and remote-failure regression cases.
**What I changed or rejected:** Pending human review. Kept the existing direct logout path when the access cookie is present, and kept local clearing on every outcome.
**Verification:** `npm.cmd run test:routes` passed (19/19), `npm.cmd run lint` passed, and `npm.cmd run build` passed. Live User Service verification remains pending.

### 2026-09-29 12:52 SGT — PR #24 rejected-login logging

**Tool:** Codex (GPT-6) · **Mode:** debug, explain
**Files:** `frontend/app/api/session/login/route.ts`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`

**Scenario:** Address the review finding that User Service login 401/403 responses lacked a structured denial event, and explain the separate expired-access logout finding without changing logout.

**Prompt (exact):**

~~~text
update the logging issue and

"The access cookie expires before the refresh cookie. In that state this branch clears local cookies without calling User Service, leaving the refresh session usable. Recover a short-lived access token through the existing refresh path, attempt logout with the rotated refresh token, and still clear local cookies if either call   explain this?
~~~

**What it produced:** Logged upstream login 401/403 using the existing structured helper, without credentials, and added a route regression test. Explained the token lifetimes and remote revocation gap separately.
**What I changed or rejected:** Pending human review. No logout behavior was changed.
**Verification:** Frontend route tests and lint recorded in the handoff.

### 2026-09-29 10:54 SGT — PR #24 token and security review fixes

**Tool:** Codex (GPT-6) · **Mode:** generate, debug, refactor
**Files:** `frontend/lib/{protected-gateway,session-server}.ts`, `frontend/app/api/session/{login,verify,refresh,logout}/route.ts`, `frontend/app/profile/page.tsx`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`

**Scenario:** Investigate PR #24 review comments, implement the approved security plan in the working tree, run checks and a read-only review agent. No commit was requested.

**Prompts (exact):**

~~~text
investigate the current PR and resolve its comments on the token and security

the rotated credentials shouldnt exist any longer than it is used, 403 can be used to differentiate between authenticated but not authorised. a request that presents the old token *after* rotation completes should be rejected.

PLEASE IMPLEMENT THIS PLAN:
# Resolve PR #24 token and security comments

## Summary

Keep rotated credentials only while a refresh is in flight. Once it settles, remove the coordination entry; any later request using the consumed refresh token must reach User Service and be rejected. Keep 403 distinct from 401: it means an authenticated request was denied authorization.

## Implementation

- Update the frontend’s protected gateway helper to coalesce concurrent in-flight refreshes, delete the entry on settlement, and attach rotated cookies even when the subsequent protected request fails. Preserve the existing behavior that clears the session after a second 401.
- Emit the existing structured `unauthorized_access` log for upstream 403 responses and rejected cross-origin session requests, without logging tokens or personal data. Guard cookie-backed profile and status requests against cross-origin requests before they can trigger refresh.
- Give server-to-gateway calls an explicit 10-second timeout and return the existing unavailable response on timeout. Remove the profile page’s session-check preflight so local logout can clear cookies during an upstream outage.
- Update AI disclosures and `ai/usage-log.md` as required by `AGENTS.md`. No public endpoint or response shape changes are planned.

## Verification

- Extend route tests to cover concurrent refresh sharing, rejection of a consumed token after rotation, retained cookies when a protected retry fails, 403 logging, cross-origin rejection before refresh, gateway timeout, and logout during an outage.
- Run frontend route tests, lint, and build. Review each PR thread against the resulting diff before marking it resolved.

## Assumptions

- The confirmed rule is that completed refresh results are never replayed, even to a request carrying a stale cookie.
- A 403 remains a 403 to the caller and is recorded as an authorization denial; it does not trigger refresh or clear cookies.
- The timeout is 10 seconds for all frontend server-to-gateway calls.

do not commit the changes run a [$review-agent](C:\Users\njyang\\.codex\skills\\.system\review-agent\SKILL.md)
~~~

**What it produced:** Removed the completed refresh replay window, kept rotated cookies after a failed retry, added structured 403/origin logs and a 10-second gateway timeout, guarded cookie-backed reads, and let profile logout reach local cookie clearing during outages. Added regression tests and ran a read-only review agent.
**What I changed or rejected:** Pending human review. The read-only review agent reported no findings; its suggested GET Origin-header test was added.
**Verification:** `npm.cmd run test:routes` passed (17/17), `npm.cmd run lint` passed, `npm.cmd run build` passed, and the read-only review agent reported no findings. Live User Service verification remains pending.

### 2026-09-28 — BFF protected-request refresh (feature/frontend-user-service-integration)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug
**Files:** `frontend/lib/protected-gateway.ts`, `frontend/lib/session-client.ts`, `frontend/app/api/session/{profile,status,refresh}/route.ts`, `frontend/test/routes.test.mjs`, `frontend/README.md`, `ai/usage-log.md`

**Scenario:** Implement the approved plan to move protected-request refresh and single-use token coordination into Next.js. User Service and gateway contracts were inspected but not changed.

**Prompt (exact):**

~~~text
PLEASE IMPLEMENT THIS PLAN:
# Move protected-request refresh into the Next.js BFF

## Current request flow

The frontend uses the Next.js App Router and Next.js 16.3.5. The User Service implementation is available on `origin/feature/user-service-admin-reactivate`; its source is not present on the current branch.

```text
Sign-in:
Browser form → Next.js /api/session/login → Gateway /auth/login
             → User Service → token pair
Next.js stores both tokens in HttpOnly cookies → browser receives { ok: true }

Protected profile request:
Browser → Next.js /api/session/status → Gateway /users/me
Browser → Next.js /api/session/profile → Gateway /users/me
Gateway verifies the access JWT using cached JWKS → forwards bearer token

Expired or absent access cookie:
Browser session-client.ts → /api/session/status → 428
Browser, coordinated by Web Locks → /api/session/refresh
Next.js → Gateway /auth/refresh → User Service rotates refresh token
Next.js replaces both cookies → browser retries its intended request

Logout:
Browser → Next.js /api/session/logout → Gateway /auth/logout
Next.js clears both cookies even if remote logout fails
```

## What matches, and what needs changing

- [Session handlers](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/frontend/lib/session-server.ts) keep tokens in HttpOnly, SameSite=Lax cookies. Login and verification responses do not include token values. The `sessionStorage` uses found are for email and a logout notice, not tokens.
- [Gateway verification](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/api-gateway/src/auth.ts) checks signature, `exp`, and `nbf`, plus issuer and audience when configured. It caches JWKS for 60 seconds; it does not call User Service for each protected request. [The proxy](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/api-gateway/src/proxy.ts) forwards `Authorization`. Invalid tokens produce 401; unavailable JWKS produces 503.
- The User Service signs RS256 access tokens valid for **15 minutes** and rotates **single-use** refresh tokens valid for **90 days**. Reusing a rotated token revokes that user’s refresh sessions. Its JWT currently has `sub`, `role`, `iat`, and `exp`; it does not set `iss` or `aud`. Accordingly, the gateway’s optional issuer and audience settings must remain unset until the User Service contract changes.
- The main gap is ownership of refresh: [the browser wrapper](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/frontend/lib/session-client.ts) checks status and calls refresh. [The profile handler](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/frontend/app/api/session/profile/route.ts) forwards a 401 without refreshing or retrying. Its browser caller can subsequently refresh and retry, but the BFF does not yet provide the requested one-refresh, one-retry behavior.
- Web Locks coordinate the current browser flow across tabs. There is no Next.js process-level coordination for simultaneous server requests. Without Web Locks, the current browser wrapper refuses to refresh. The access cookie expires after 15 minutes, so its absence normally triggers refresh through status rather than through an upstream 401.
- Browser-to-Next.js session mutations already require a matching `Origin`. The public registration and recovery forms use a same-origin gateway rewrite and do not carry the session cookies to the gateway as credentials. Keep CSRF checks on cookie-authenticated Next.js mutation routes; do not add them to Next.js-to-gateway bearer calls. Logout already clears local cookies after remote failure.

## Implementation changes

1. Add a shared **server-only protected gateway request** helper beside `session-server.ts`. It sends the access cookie as a bearer token. On an upstream 401, it attempts `POST /auth/refresh` once, replaces both cookies, and retries the original request once. A second 401 ends that request as unauthenticated. A refresh 401 clears both cookies; a refresh 500/503 returns an unavailable response without retrying. Never place tokens in the response body or logs.
2. Add process-level single-flight coordination keyed by a hash of the presented refresh token. Concurrent requests carrying the same cookie pair await one rotation and receive the resulting cookie pair before retrying. Keep completed rotation results briefly so an already-started request with the old cookie does not submit it again. Do not persist or log raw refresh tokens. Retain Web Locks around browser session mutations and refresh-triggering calls to coordinate tabs; document that process-local coordination alone does not cover multiple Next.js instances.
3. Migrate `/api/session/profile` to that helper. Make `/api/session/status` use the same server-side session recovery path so root and Home navigation can recover without a browser-issued refresh call. Simplify `session-client.ts` to request status or protected data and handle authenticated, unauthenticated, and unavailable responses; remove browser ownership of `/api/session/refresh` once all callers have migrated. Preserve the existing login, verification, and logout contracts.
4. Keep both cookies HttpOnly, SameSite=Lax, Secure on HTTPS, and scoped to `/`. Keep the access cookie lifetime aligned with the User Service’s `expiresIn` and the refresh cookie at 90 days; JWT `exp` and User Service refresh validation remain authoritative. The shared path is needed because status, profile, and logout read these cookies. A narrower refresh-cookie path would require a larger session-routing change.
5. Update the frontend README and AI usage log. Leave the gateway verifier, token forwarding, User Service rotation and RBAC ownership unchanged.

## Tests and acceptance

- Extend browser tests to confirm login sets HttpOnly cookies and no token appears in browser-readable storage or response JSON; a valid access token causes no refresh; an expired or invalid token causes one refresh, both cookies rotate, and the original protected request retries exactly once.
- Cover refresh 401 clearing cookies and redirecting protected pages to `/signin`; refresh 500/503 returning an unavailable state without a loop; a second protected-request 401 stopping after one retry; concurrent requests and two tabs submitting a single-use refresh token only once; and logout clearing cookies after remote failure.
- Retain gateway tests proving expired tokens return 401, valid tokens use local verification and cached JWKS, issuer/audience checks apply only when configured, and bearer authorization reaches downstream services.
- Run frontend route tests, lint, build, and gateway tests. Use the existing mock gateway first, then perform a live User Service check when it is available.

## Assumptions and implementation order

Use one Next.js process for the university demo, with Web Locks for tab coordination and process-local single-flight for concurrent server requests. A multi-instance deployment would need shared coordination or a different session design. Implement the shared BFF request and coordination first, migrate profile and status, simplify the browser wrapper, then run the tests and live check.

**Highest risk:** accidentally submitting a rotated refresh token twice, or allowing an older response to overwrite newer cookies. Preserve explicit tests for both races. The token cookie settings, gateway JWT verification and forwarding, and local-cookie clearing on failed logout already behave as intended.
~~~

**What it produced:** A server-only protected gateway helper, shared process refresh coordination, status/profile migration, browser wrapper simplification, and expanded browser tests.

**What I changed or rejected:** Human review pending. The gateway and User Service were left unchanged. The explicit refresh route remains as a compatible path, but the browser no longer calls it.

**Verification:** `npm run test:routes` passed 11 browser tests, frontend lint/build passed, and `api-gateway/npm test` passed 19 tests. The User Service was unavailable on localhost:3001, so live verification remains pending.

### 2026-09-28 — Frontend User Service integration (feature/frontend-user-service-integration)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug
**Files:** `frontend/app/**`, `frontend/lib/**`, `frontend/test/routes.test.mjs`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/README.md`, `frontend/.env.example`, `frontend/.gitignore`, `.env.example`, `docs/frontend-gateway-implementation-plan.md`, `ai/usage-log.md`

**Scenario:** Implement the approved User-first frontend integration with reviewable PRs. The user selected a Next.js server session with HttpOnly cookies, complete registration and password recovery, and no Supplier Service changes.

**Prompt (exact):**

~~~text
PLEASE IMPLEMENT THIS PLAN:
# Frontend integration with reviewable PRs

## Branch and PR order

1. Create `feature/frontend-user-service-integration` from `feature/frontend-service-integration`. Implement and test the User flows, push the branch, and open a PR into the integration branch. Merge after human review.
2. Create `feature/frontend-supplier-service-integration` from the updated integration branch. Implement and test Home location loading, push it, and open a draft PR into the integration branch. Complete the live test after the Supplier owner updates its guard; then review and merge.

Each PR will include a concise summary, affected routes, the service contract it uses, verification commands and results, remaining limitations, and a link to its AI usage-log entry.

## User integration

- Move Sign In to `/signin`, rename the current locations screen to `/home`, update navigation, and redirect `/locations` to `/home`. The root route checks or refreshes the server-managed session and sends the user to `/home` or `/signin`.
- Complete registration with OTP confirmation; connect sign-in and both password-recovery steps to the existing gateway routes.
- Use Next.js handlers and HttpOnly, SameSite cookies for access and refresh tokens. Handle single-use refresh without concurrent reuse, attach bearer tokens to protected calls, and support logout.
- Fetch `GET /users/me` to populate profile fields. Keep credit and order figures unavailable until those services are integrated.

## Supplier integration

- Load active locations on `/home` through gateway `GET /locations`; connect search, live type filters, and pagination to the Supplier API.
- Do not change Supplier Service or add gateway identity headers. Its current development guard remains a blocker for live requests; document that in the draft PR and require a successful live check before merge.

## Verification

Run relevant browser route tests, frontend lint/build, and gateway tests for each branch. Test User flows against the live User Service when available. Test Supplier UI against mocks first, then verify browser → gateway → Supplier with valid and missing tokens after the Supplier guard is updated. Update documentation and the AI usage log on each branch.
~~~

**Review follow-up:** The user supplied a SoCLaaS review of commit `35ca6ee` as an attachment. It asked to verify cookie flags, refresh handling for HTTP 428, token-response validation, and optional phone formatting. Codex inspected the omitted session modules, added browser assertions for HttpOnly/SameSite cookie attributes, cookie clearing, malformed token responses and concurrent refresh, and adjusted phone formatting.

**Further prompt (exact):** `can you check the codex review comments in the PR`

**Codex PR review response:** Codex checked the five inline comments on PR #24. It added strict Zod validation for login and verification bodies, structured logging for profile requests without an access cookie, and serialized login, verification and logout with refresh. It tested rejection of extra fields and a simultaneous refresh/login race. The later exact prompt was: "failed remote logout should remove the local cookies, explain the other browser choice". The logout handler now clears local cookies even when User Service revocation fails, and Sign In displays that revocation was not confirmed. No-Web-Locks behavior remains under discussion.

**What it produced:** User integration branch with login, OTP verification, password recovery, profile, logout, server session cookies, refresh coordination and browser tests. Supplier work follows after review and merge of this branch.

**What I changed or rejected:** Human review pending. The implementation does not modify User Service or Supplier Service and does not expose returned token values in browser JSON.

**Verification:** `npm run test:routes` passed seven browser tests after the Codex review follow-up; `npm run build` and `npm run lint` passed. Live User Service verification remains pending.

### 2026-09-28 — Gateway-local .env configuration (feature/api-gateway-refactor)

**Tool:** Codex (GPT-6) · **Mode:** refactor, debug
**Files:** `api-gateway/src/config.ts`, `api-gateway/test/config.test.js`, `api-gateway/.env.example`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `.env.example`, `ai/usage-log.md`

**Scenario:** Corrected the initial root `.env` approach so the gateway reads only its own environment file. The root `.env` loading entry was removed.

**Prompt (exact):**

~~~text
shouldnt the gateway read from a .env file for the url of the different services and configs...
undo that and remove it for usage log. each service and api gateway should have it's own env. its a microservice architecture which means they shouldnt share an env
~~~

**What it produced:** Gateway-local `.env` loading, a service-specific example file, precedence tests and updated setup instructions.

**What I changed or rejected:** The user rejected loading the shared root `.env`; this replaces that work. No secret values or new configuration keys were added.

**Verification:** `npm.cmd test` passed, including the new configuration tests.

### 2026-09-28 — Gateway architecture refactor (feature/api-gateway-refactor)

**Tool:** Codex (GPT-6) · **Mode:** refactor, debug
**Files:** `api-gateway/src/**`, `api-gateway/test/**`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `ai/usage-log.md`

**Scenario:** Separate route definitions, authentication, proxying and request logging while preserving the gateway's public routes and service RBAC boundary.

**Prompt (exact, from the attached text):**

~~~text
Refactor the API gateway to make it scalable and maintainable as more backend services are added.

Current gateway structure:

src/
├── auth.ts
├── config.ts
├── proxy.ts
└── server.ts

The current server.ts contains service-specific route matching functions such as userRoute() and supplierRoute(), authentication checks, logging, proxying, health checks, and error handling all in one file.

Please refactor this without changing the existing external API behavior.

Architecture requirements:

1. Keep the API gateway responsible for:
   - routing requests to the correct backend service
   - JWT authentication / token verification
   - access logging
   - health endpoint
   - proxying requests
   - generic gateway-level error handling

2. Do NOT move service-level authorization/RBAC into the gateway.
   - The gateway should only distinguish public vs authenticated routes.
   - Individual backend services remain responsible for checking roles/permissions and returning 403 when appropriate.
   - This matches our project architecture: gateway authenticates, each service authorizes.

3. Replace service-specific routing logic in server.ts with declarative route definitions.

Target structure should be approximately:

src/
├── server.ts
├── app.ts
├── config/
│   └── index.ts
├── auth/
│   ├── verify-token.ts
│   └── auth.middleware.ts
├── routing/
│   ├── router.ts
│   ├── types.ts
│   └── routes/
│       ├── user.routes.ts
│       ├── supplier.routes.ts
│       └── index.ts
├── proxy/
│   └── proxy.ts
├── middleware/
│   ├── request-logger.ts
│   └── error-handler.ts
└── utils/
    └── response.ts

You do not have to follow this structure exactly if a simpler structure is cleaner, but keep concerns separated and avoid unnecessary abstraction.

4. Define a reusable GatewayRoute type, something conceptually like:

type GatewayRoute = {
  method: string;
  pattern: RegExp;
  service: ServiceName;
  auth: 'public' | 'authenticated';
};

5. Each service should expose its own route definitions.

For example:

user.routes.ts
- GET /.well-known/jwks.json -> public
- POST auth/register -> public
- POST auth/register/verify -> public
- POST auth/register/resend-otp -> public
- POST auth/login -> public
- POST auth/refresh -> public
- POST auth/password/forgot -> public
- POST auth/password/reset -> public
- POST auth/logout -> authenticated
- GET /users/me -> authenticated
- PATCH /users/me -> authenticated
- GET /admin/users -> authenticated
- PATCH /admin/users/:userId/role -> authenticated

Use the configured authPrefix rather than hard-coding it where appropriate.

supplier.routes.ts
- GET /location-types
- GET /locations
- POST /locations
- GET /locations/:locationId
- PATCH /locations/:locationId
- POST /locations/:locationId/deactivate
- POST /locations/:locationId/restore

These gateway routes should require authentication according to the current implementation. Do NOT enforce ADMIN role in the gateway; Supplier Service handles that.

6. Implement a generic router:

findRoute(routes, method, path)

It should return the matching route definition instead of server.ts knowing anything about User Service or Supplier Service route shapes.

7. Centralize service URL resolution.

For example:

getServiceUrl(route.service, config)

Avoid scattered conditionals such as:

if user -> config.userServiceUrl
if supplier -> config.supplierServiceUrl

Design it so adding an order service later is straightforward.

8. Extract authentication handling so this duplicated code disappears:

if (!await verify(request.headers.authorization)) {
  console.warn(...)
  return json(response, 401, { error: 'Unauthorized' });
}

Create a reusable authentication helper/middleware.

9. Improve error handling.

Currently one large try/catch can turn any error into:

503 Authentication service unavailable

That is misleading.

Separate at least:

- authentication verifier failure -> 503 Authentication service unavailable
- invalid/missing authentication -> 401 Unauthorized
- unmatched route -> 404 Not found
- upstream/proxy failure -> 502 Upstream service unavailable
- unexpected gateway error -> 500 Internal server error

Be careful not to send a second response if the proxy has already started writing.

10. Improve structured logging.

Keep JSON structured logs.

At minimum log completed requests with:
- event
- requestId
- method
- path
- target service if applicable
- status
- durationMs

Also log authentication failures and upstream failures.

Generate or propagate a request ID:
- use incoming x-request-id if present
- otherwise generate one
- forward it to downstream services if feasible with the existing proxy implementation

11. server.ts should become very small.

Its responsibility should mostly be:
- load config
- create the gateway/app
- start listening
- log gateway_started

Move request-processing logic elsewhere.

12. Preserve dependency injection/testability.

The existing createGateway(config, verify = createTokenVerifier(config)) pattern allows tests to inject a fake token verifier. Preserve this capability or improve it.

13. Preserve existing behavior unless required for the architectural refactor.

Do not:
- rename public API endpoints
- change request/response payloads
- introduce a web framework such as Express/Fastify unless absolutely necessary
- add Kong, Envoy, service mesh, Kubernetes-specific components, etc.
- duplicate RBAC logic from downstream services
- overengineer the gateway

Continue using node:http.

14. Add/update tests.

Cover at least:
- GET /health -> 200
- unknown route -> 404
- public user route works without auth
- protected user route rejects invalid auth with 401
- protected supplier route rejects invalid auth with 401
- valid authenticated route proxies to correct service
- dynamic routes such as /locations/:id match
- /locations/:id/deactivate and /restore match
- /admin/users/:id/role matches
- malformed similar paths do not accidentally match
- verifier exception returns 503
- proxy/upstream failure returns 502 if testable
- route ordering does not cause dynamic routes to shadow more specific routes

15. Check the existing repository before making changes.

Do not assume the pasted snippets represent the entire implementation. Inspect:
- package.json
- tsconfig
- existing tests
- auth.ts
- config.ts
- proxy.ts
- server.ts
- downstream route conventions

Reuse existing utilities where appropriate instead of rewriting working code unnecessarily.

16. Keep TypeScript strict and avoid `any`.

Prefer small explicit types and functions.

17. Important: regex/path matching must be correct.

Examples:
- /admin/users/<id>/role
- /locations/<id>
- /locations/<id>/deactivate
- /locations/<id>/restore

Do not use malformed escaped regexes. Ensure matches are anchored with ^ and $ so extra path segments do not match unintentionally.

Before editing:
1. Inspect the current gateway implementation and tests.
2. Briefly explain the refactor plan.
3. Then implement it.

After editing:
1. Run typecheck.
2. Run gateway tests.
3. Run lint if configured.
4. Fix any failures caused by the refactor.
5. Summarize:
   - files added/changed
   - architectural changes
   - behavior preserved
   - tests run and results
   - any remaining concerns

Keep the solution appropriate for a university microservices project: clean, extensible, testable, but not production-infrastructure overkill.
~~~

**Additional prompt (exact):**

~~~text
maybe you can js branch out from that integration branch into the a api-gateway branch, commit and push those changes there, then merge it back into this frontend-service integration branch
~~~

**What it produced:** Declarative service routes, a generic matcher, a small startup entry point, request IDs and structured logs, distinct 401/502/503/500 handling, and regression tests. A review finding led to a follow-up fix that returns 503 only for JWKS outages and 500 for unexpected verifier errors.

**What I changed or rejected:** Pending gateway owner review. The existing bearer-token handoff remains unchanged.

**Verification:** `npm.cmd test` passed all 19 tests after the review fix; human review remains pending.

### 2026-09-28 — Supplier Service gateway routes (feature/gateway-supplier-routes)

**Tool:** Codex (GPT-6) · **Mode:** generate, explain
**Files:** `api-gateway/src/server.ts`, `api-gateway/test/gateway.test.js`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `ai/usage-log.md`

**Scenario:** Map the Supplier Service routes while leaving the final service authentication handoff undecided.

**Prompts (exact):**

~~~text
can you just route the end points for user branch and supplier branch first before we decide how the authentication is going to be handled
implement the plan to integrate user and supplier service
~~~

**What it produced:** An exact Supplier route map, gateway tests, and gateway documentation. Protected routes continue the existing JWT verification and forwarding behavior.

**What I changed or rejected:** Pending owner review; the authentication handoff remains subject to team confirmation.

**Verification:** Gateway test and build results are recorded with the implementation review.

### 2026-09-28 — User Service gateway routes (feature/gateway-user-routes)

**Tool:** Codex (GPT-6) · **Mode:** generate, explain
**Files:** `api-gateway/src/server.ts`, `api-gateway/test/gateway.test.js`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `ai/usage-log.md`

**Scenario:** Map implemented User Service routes while leaving the final service authentication handoff undecided. PR #22 added self-profile and admin routes to the previously inspected auth branch.

**Prompts (exact):**

~~~text
can you just route the end points for user branch and supplier branch first before we decide how the authentication is going to be handled
can you inspect origin/pr/22
implement the plan to integrate user and supplier service
~~~

**What it produced:** An exact User route map, gateway tests, and gateway documentation. Protected routes continue the existing JWT verification and forwarding behavior.

**What I changed or rejected:** Pending owner review; the route and authentication handoff decisions remain subject to team confirmation.

**Verification:** Gateway test and build results are recorded with the implementation review.

### 2026-09-28 — Reconstruct frontend and gateway AI usage (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** explain, refactor
**Files:** `ai/usage-log.md`

**Scenario:** I asked Codex to reconstruct my entries from this project's local chat transcripts after the log had been removed and restored.

**Prompts (exact):**

~~~text
can you restore the AI usage-log

Ok ONLY from now on, we shall continue on the AI Usage Log, the currently implemented gateway and frontend, can you search our chat history to populate the AI-usage log under Jie Yang

can you search our chat history to populate the AI-usage log under Jie Yang
~~~

**What it produced:** Dated entries below, based on the September 24, 25, 27 and 28 transcripts. The entries distinguish generated code, explanations, team direction and checks reported by Codex. They are provisional work-session entries until the work is assigned to PRs.

**What I changed or rejected:** I restricted the reconstruction to my frontend and gateway work. The other members' sections remain placeholders. My review of these entries is pending.

**Verification:** Codex compared the prompts with local session transcripts and the working-tree files. This log edit does not verify the application itself.

### 2026-09-28 — Gateway identity handoff and plan update (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** explain, refactor
**Files:** `docs/frontend-gateway-implementation-plan.md`; gateway code and tests were inspected, not changed in this exchange.

**Scenario:** I asked about JWT/JWKS, the gateway's authentication role, why caller-supplied identity headers are stripped, and the remaining work. I directed the gateway to forward the JWT to services, then asked Codex to update the plan.

**Prompts (exact, in chronological order):**

~~~text
middleware authorization\
authentication with api gateway

is this enough information to implement the gateway

can you explain further on how JWTK and JWT works first? what are the options i have and the drawbacks etc for each

i still dont understand  this...

so what are the different options meaning?

gateway should handle authentication while the services themselves handle authorization

ok wait what are the current implemented things, can we split them into valid commits and commit it to the branch

dont commit anything yet, jusst explain it first, and get rid of the usage-log.md

whats the proxy n whys it strip the caller supplied user id and role

whats the diff between the 2 options

so it does both now?

the gateway should just forward the JWT to the different services

does the current gateway forward the jwt to the supplier service

how far into this are we

update the plan
~~~

**What it produced:** Codex explained the current gateway behavior and updated the plan to record the JWT handoff, progress and pending contracts. It did not make a commit.

**What I changed or rejected:** I directed the JWT-forwarding approach and stopped the proposed commit. I requested removal of the old log, then later requested its restoration. Service owners still need to confirm their JWT and endpoint contracts.

**Verification:** The plan records eight passing gateway tests from prior work. No live browser-to-service integration was demonstrated in this exchange; my review remains pending.

### 2026-09-27 — Gateway scaffold, frontend routes and partial connection (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug, explain
**Files:** `api-gateway/**`, `frontend/**`, `docs/frontend-gateway-implementation-plan.md`, `.env.example`

**Scenario:** I asked Codex to plan the gateway, implement part 1, add missing frontend pages based on Figma, inspect the Supplier PR, correct two gateway mismatches, and connect token-independent registration actions to the gateway.

**Prompts (exact, in chronological order):**

~~~text
This action is unavailable right now. Please try again later.
whhy, also can you change the name to be GrabFoc instead of campus errand platform?

ok can you create some skills or use the AWWARD and frontend design skills downloaded and architecture for the frontend and API gateway.


I need to create an API gateway for the application. the Sign up and sign in will be given to the user service to handle but will go through the gateway first. The Supplier service will handle the supllier related pages

can you write a .md file of this implementation plan first then implement part 1 first

what are the routes to the other pages

can you create the supplier and user pages too? did you not refer to the figma

most recent PR looks kinda good on postman collection, can start on the gateway stuff&#x20;

this is the supplier service contracts its in the new PR, should i pull it first or can we develop the gateway without this

why cant i click courier view

should i branch out to a feature/frontend branch or should i combine the frontend and api-gateway branches?&#x20;

I was thinking checkout to a frontend-apigateway branch then i pull from the Supplier service branch first

ok can you inspect the Supplier branch?

1. `/location-types` currently returns 404 at the gateway because only `/locations` is routed.
2. The Supplier service defaults to port **3002**, while our example config points it to **3003**.&#x20;

change these 2 first

can you explain how the gateway and frontend work rn..

The gateway also currently passes client-supplied identity headers through   whats this mean and can we connect the gateway to the frontend

cant we implement the other things first before the token related issues.

how can i set up tests to check where each button sends to? I cant check if it sends to the gateway

sign in isnt routed to the api gateway?
~~~

**Additional Figma links supplied in this exchange:**

~~~text
https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-226&p=f&t=zTdyG6lDCXrt5haX-0

[https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-1069&p=f&t=zTdyG6lDCXrt5haX-0](https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-1069\&p=f\&t=zTdyG6lDCXrt5haX-0) user profile page
~~~

**What it produced:** Codex wrote the plan and gateway scaffold with health, public auth proxy, JWT/JWKS verification for protected Supplier routes, tests, configuration and Dockerfile. It added `/locations` and `/profile` frontend shells from the linked frames, made the requester/courier switch clickable, routed `/location-types`, corrected example ports, added a same-origin frontend-to-gateway rewrite, and connected sign-up and OTP resend. It added frontend route tests and changed the verification UI to six digits. Sign-in, code confirmation, session handling and live Supplier data remain pending.

**What I changed or rejected:** I requested the GrabFoc name, two specific gateway corrections, a working courier switch, and token-independent steps first. I asked Codex to inspect the Supplier PR without merging it. Codex flagged the Supplier development guard that trusts client identity headers; that integration remains pending. Final token storage and owner-confirmed service contracts remain pending.

**Verification:** Codex reported passing gateway tests after its changes (six initially, then seven after `/location-types`) and passing frontend lint/build after UI changes. The working-tree plan later records eight gateway tests. These are Codex-reported checks; a live end-to-end test and my own review remain pending.

### 2026-09-24 to 2026-09-25 — Figma authentication frontend and npm verification (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug, explain
**Files:** `frontend/app/**`, `ai/usage-log.md` (initial draft); Figma MCP and skills were installed in local Codex configuration outside the repo.

**Scenario:** I asked Codex to read the D1 document, use the Figma mockup, install frontend skills and Figma MCP, then recreate the authentication frontend before gateway integration.

**Prompts (exact, in chronological order):**

~~~text
C:\Users\njyang\Downloads\cs3219-group3-D1.docx Read this file, i need to create the UI and API gateway for this application. The figma design can be found here. https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=0-1&t=zTdyG6lDCXrt5haX-0 can we install some frontend skills like the AWWWARDS skill and $skill-installer frontend-skill, npx skills add https://github.com/devmartinese/awwwards-animations-skill --skill awwwards-animations run these commands. Then create the neccessary components for the front end for the user service and the supllier service first.

Can you download the figma mcp

https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-122&t=zTdyG6lDCXrt5haX-0 can you refer to this now? and recreate the current front end first?

can you use the figma mcp tools

continue please

why is there a bun runtime error i dont think im using bun for this application right

js run npm instead of bun

uh how do i run dev

'npm' is not recognized as an internal or external command,
operable program or batch file.
~~~

**What it produced:** Codex installed the AWWWARDS skill through the Codex installer after `npx` was unavailable, plus frontend and Figma skills. It configured Figma's remote MCP, inspected the authentication frames, and generated responsive sign-in (`/`), sign-up (`/signup`) and verification (`/verify`) screens. Form submission remained unconnected to User Service. It initially tried Bun for checks, then used a verified portable Node installation to run npm after I objected.

**What I changed or rejected:** I asked to recreate the frontend first, questioned Bun, and directed Codex to use npm. The initial UI used the four-digit Figma mockup; the later User Service contract led to the six-digit change recorded above.

**Verification:** Codex reported `npm ci`, `npm run lint` and `npm run build` passing on September 24, with `/`, `/signup` and `/verify` generated. I still need to review the UI and test it against a live User Service.

## 2026-09-28 13:08 UTC — CodeQL advanced setup

- Tool and mode: Codex (GPT-6), generate and debug.
- Usage scenario: Configure CodeQL analysis for public fork pull requests while continuing to scan JavaScript/TypeScript and GitHub Actions.
- Exact user prompt: “lets do the configuring of a nadvanced set up”
- Key response: “I’ll configure the CodeQL workflow for pull requests, then switch GitHub from default to advanced setup and check whether PR #7 receives a scan. I’ll inspect the repository settings and existing workflow first.”
- Output: `.github/workflows/codeql.yml` in PR #23.
- Human review: Pending. The CodeQL jobs ran successfully after the repository switched to advanced setup.

## 2026-09-29 05:34 UTC — Non-local HTTP browser notice

- Tool and mode: Codex (GPT-6), debug and generate.
- Usage scenario: Diagnose the frontend session screen on a plain HTTP network address and show a clear unsupported-browser message, following the user's earlier preference for that case.
- Exact user prompts: “the app does not need to support plain http on non-local host, in that scenario a simple "browser not supported" should suffice but its a low priority issue” and “if i run it on [http://100.79.249.10:3000](http://100.79.249.10:3000) it'll keep saying its checking my session”.
- Key response: Reproduced the stuck session screen at the reported address; the session-status request returned 403. Its page also failed to hydrate, so the notice is rendered by the server layout for HTTP on non-local hosts while keeping localhost and HTTPS available.
- Files: `frontend/app/layout.tsx`.
- Human review: Pending.

## 2026-09-29 — Reusable frontend error handling

- Tool and mode: Codex (GPT-6), generate, debug, explain.
- Usage scenario: Add reusable service-error parsing, toast feedback and form field errors on the User integration branch, with a stacked PR workflow.
- Exact user prompts:

~~~text
the user service integration branch can be accessed to work on reading the response to receive the proper errors
can we define proper error handling and error popups on the front end ? update the user service integration branch to the latest  and branch out to handle the errors.

The supplier service should also define the proper errors
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "The request is invalid.",
        "details": {
            "fields": [
                {
                    "field": "email",
                    "message": "must be a valid email address"
                },
                {
                    "field": "email",
                    "message": "must be an NUS address (@u.nus.edu or @nus.edu.sg)"
                }
            ]
        }
    }
}

Once done, create the relevant PRs to merge user error handling to user service integration and back to service integration. The error handling on the front end should be extensible to other future services like order service etc. The other services also have certain fields to fill out and it'll be good if we can have a error handling for user and other services too

PLEASE IMPLEMENT THIS PLAN:
# Reusable frontend error handling

## Summary

Update `feature/frontend-user-service-integration` from the latest `main`, then create `feature/frontend-user-error-handling`. Implement error handling on User Service screens using components and a response parser that Supplier, Order, and future forms can reuse.

## Implementation

- Add a shared parser that normalizes User Service’s `{ error: { code, message, details } }` and Supplier’s current RFC 9457 Problem Details into a frontend error type. Keep parsing separate from service-specific code-to-message rules. Handle malformed responses with safe defaults.
- Add an accessible, dismissible toast for operation failures and reusable inline field errors for validation. Each form supplies its backend-to-frontend field mapping, including `displayName` → Full Name. Keep a visible retry action for failed page loads.
- Apply the system to sign-in, sign-up, OTP verification and resend, password recovery, and profile loading and logout. Handle known User Service codes such as `EMAIL_TAKEN`, `OTP_INVALID`, `OTP_EXPIRED`, `ACCOUNT_LOCKED`, and `RATE_LIMITED`; preserve password recovery’s account-enumeration protection.
- Keep service response shapes unchanged. Supplier backend codes and field-detail extensions need Supplier owner approval, so that contract change belongs in a separate Supplier PR. Supplier screens from PR #37 are outside this round.

## Verification and PRs

- Test validation fields, known error codes, retry details, malformed responses, toast dismissal, page-load retry, and password recovery behavior. Run frontend route tests, lint, and build.
- Open PR 1 from `feature/frontend-user-error-handling` into `feature/frontend-user-service-integration`. After PR 1 is reviewed and merged, open PR 2 from the updated User integration branch into `feature/frontend-service-integration`. Do not merge either PR automatically.
- Record AI assistance and add file disclosures as required by `AGENTS.md`.

## Assumptions

- “Latest” means the remote `main` at implementation time.
- The shared parser supports Supplier’s current response format now; it does not depend on the pending Supplier API decision.
- Only User Service screens adopt the new UI in this round. Future services use the same parser, toast, and field-error components.
~~~

- Key response: Updated the User integration branch from main, created `feature/frontend-user-error-handling`, normalized both existing error envelopes, and added reusable toast and field feedback to the User screens. Supplier Service's response contract remains pending its owner's approval.
- Files: `frontend/lib/service-errors.ts`, `frontend/lib/user-error-copy.ts`, `frontend/app/components/error-feedback.tsx`, User frontend screens, `frontend/app/globals.css`, `frontend/test/routes.test.mjs`, `frontend/README.md`, `ai/usage-log.md`.
- Human review: Pending PR review and manual UI inspection.

## 2026-09-29 — PR #38 review follow-up

- Tool and mode: Codex (GPT-6), debug, refactor.
- Usage scenario: Address review feedback on reusable User Service error handling.
- Exact user prompt: “in the user error handling PR there are unresolved comments, keep resolving the comments and committing, and monitor the new reviews and resolve them”
- Key response: Ensured verification and resend expose validation for fields absent from the form, made profile transport and JSON failures show a safe retry message, kept the toast timer stable across parent renders, and masked unknown backend messages on profile load/logout after a fresh review. Added regression coverage and checked PR #38 again after pushing.
- Files: `frontend/app/components/auth-screen.tsx`, `frontend/app/components/error-feedback.tsx`, `frontend/app/profile/page.tsx`, `frontend/lib/user-error-copy.ts`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`.
- Human review: Pending PR review.

## 2026-09-29 — PR #39 environment template review

- Tool and mode: Codex (GPT-6), documentation fix.
- Usage scenario: Address a project environment-template comment on PR #39 without editing User Service or Supplier Service components.
- Exact user prompt: “for each PR, 39 and 37, resolve the messages, ensure the changes made do not touch the individual components of the user service and supplier service.”
- Key response: Documented `NODE_ENV=production` as a safe example for the existing Supplier development-auth guard. Service code was unchanged.
- Files: `.env.example`, `ai/usage-log.md`.
- Human review: Pending PR review.
