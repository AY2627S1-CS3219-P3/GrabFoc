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

<!-- Add your entries here. -->

## Jie Yang

<!-- Add your entries here. -->
