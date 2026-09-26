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

### 2026-09-26 — User Service Phase 0 steps 5–8: the auth flows (PRs #15, #16, #17)

**Tool:** Claude Code (Claude Opus 5) · **Mode:** generate, debug, explain
**Files:** `user-service/src/auth/**`, `user-service/src/users/**`, `user-service/src/otp/**`,
`user-service/README.md`, `user-service/AGENTS.md`, `user-service/postman/`

**Scenario.** Implemented the four public auth flows from the rules already recorded in
`user-service/AGENTS.md`: sign-up (register / verify / resend), login with lockout, refresh and
logout, and forgot/reset password. The rules were ours; the code, tests and doc expansions were
generated against them.

**Prompts (exact):**

> implement register, verify and resend otp

> in users.repostiory.ts, is emailhash not required?

> explain the issue simply for POST /auth/register/verify

> keep 400 OTP_EXPIRED

> teach me the steps to do testing on my own

> is this review important? [pasted review comment asking for the user insert and the refresh-token
> creation to be wrapped in one transaction]

> yes implement it, and add the test

> on a new branch, i want to implement login,lockout,refresh,and logout. but lets implement login
> and lockout first

> implement refresh and logout

> for refresh, what does it mean from a user perspective? like the user will be logged out after a
> period of time?

> let user be logged out after 3months instead of 7days

> on a new branch, i want to implement forget and reset password

**Decisions I made, not the AI:**

- **`OTP_EXPIRED`, not 404, for `/auth/register/verify`** when no sign-up is waiting. The AI
  found the conflict between two lines of our own `AGENTS.md` and explained both sides; I chose
  the 400 and had the rule written down.
- **Refresh tokens last 90 days, not 7.** I asked what the 7 days meant for a user, then decided
  we would rather people stayed logged in for three months.
- **Five failures, not three, before a lockout** — already ours from D1, kept here.
- **Two choices under "Forgot and reset password" were the AI's suggestion, and I adopted them
  after reading the reasoning**: writing a decoy OTP record for an address with no account (so
  reset cannot be used to find out who has an account), and lifting a login lockout after a
  successful reset. Both are recorded in `AGENTS.md` and noted in its header.

**What I changed or rejected:**

<!-- TODO Zi Yi: add anything you edited by hand before committing. -->

**Verification.**

- Read every generated file before committing; each file header's `Author review:` line records
  what I checked.
- `npm test` (197 unit tests) and `npm run test:int` (41 integration tests against a real Redis).
- Ran all four flows against the compose stack with codes read from Mailpit: sign-up, five wrong
  passwords into a 423, refresh rotation, token reuse revoking every session, and a full password
  reset.
- **Checked the enumeration rules by measuring, not by reading the code.** An unknown address and
  a wrong password returned byte-identical 401s at 237 ms and 225 ms. `POST /auth/password/reset`
  returned byte-identical 400s for a real account and a made-up address, `attemptsRemaining` and
  all. Confirmed in `psql` that a reset revoked every refresh token (1 live → 0) and in Redis that
  an address with no account still gets an OTP record.
- Confirmed the tests actually catch what they claim, by breaking the service on purpose: removing
  the decoy record, letting the mail 503 through, dropping the status check and moving the lockout
  clear before the commit each failed the matching test.
- Grepped the service logs for a plaintext `u.nus.edu` address: none.

**Review findings acted on.** One finding on PR #15 (account creation and session issuance were
not atomic) — fixed by wrapping the insert and the first refresh token in one transaction, with a
test. One CodeQL alert (`js/insufficient-password-hash` on `hashOtp`) was a false positive: the
"password" it saw is the literal enum member name `PASSWORD_CHANGE`. Traced every call site before
dismissing it.

---

## Deanson

<!-- Add your entries here. -->

## Cole Lin

<!-- Add your entries here. -->

## Jian Bing

<!-- Add your entries here. -->

## Jie Yang

<!-- Add your entries here. -->
