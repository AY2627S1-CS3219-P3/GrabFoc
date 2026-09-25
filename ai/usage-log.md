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

---

## Deanson

<!-- Add your entries here. -->

## Cole Lin

<!-- Add your entries here. -->

## Jian Bing

<!-- Add your entries here. -->

## Jie Yang

<!-- Add your entries here. -->
