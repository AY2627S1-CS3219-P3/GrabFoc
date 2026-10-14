<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Moved Jian Bing's section out of ai/usage-log.md into this file (issue #65), plus a CodeQL entry that git blame attributes to Jian Bing from the end of Jie Yang's section; entry text unchanged. Wrote the 2026-10-12 usage-log split entry from Jian Bing's prompts.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
-->

# AI Usage Log — Jian Bing

Jian Bing's entries for the FoC AI usage log. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). Add entries to this file only, newest first.

### 2026-10-12 — Split the usage log into one file per member (issue #65)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** refactor
**Files:** `ai/usage-log.md`, `ai/usage-log/*.md`, `AGENTS.md`

**Scenario:** Every PR that added a log entry hit a merge conflict in the one shared
`ai/usage-log.md`. Split it so each member edits only their own file.

**Prompts (exact):**
> help me make a new pr where w esplit the usage-log.md into 5 markdown, 1 for each member since as it stands, everyitme we make a pr, there is a merge conflict there, and make it track the corresponging github issue i created

> yes looks good, but i think with regards to ref, maybe we can close this issue #65, and then we open a new issue isntead ot merge this ai-usag ea tthe end isntead

> the pr reviewer left some comments for pr 68 (with screenshots of the two Codex review comments)

> for all the pending auhtor review, help me edit them to say that I have checked the logs locally, to ensure it follows the guideline given by the professor in the project document, and that oepnign it on my ide shows a nice formatting, and to make sure all the comments and every other component is present

**What it produced:** Moved each `##` member section, word for word, into
`ai/usage-log/<member>.md`, and kept `ai/usage-log.md` (the path the brief names) as the index with
the rules, template and links. A script checked that every line of the original appears exactly
once across the new files. Updated the logging rule in `AGENTS.md`. After Codex review: added a disclosure
header to each member file and made `AGENTS.md` name the member file as the entry destination.
**What I changed or rejected:** Claude proposed "Refs #65"; I chose to close #65 and open a separate
issue for merging the files back into one log at the end.
**Verification:** I checked the logs locally against the AI usage-log guidelines in the project
document (Appendix 2), confirmed they render with clean formatting in my IDE, and confirmed every
entry, comment and other component is present.

### 2026-10-01 — Pass the User Service container only its own variables

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** refactor
**Files:** `user-service/compose.yaml`

**Scenario:** `user-service/compose.yaml` passed the whole repo-root `.env` into the container, so the
User Service could read every other service's secrets, such as `SUPPLIER_POSTGRES_PASSWORD`.

**Prompts (exact):**
> about the env, shouldnt every service have their own env?

> sure *(to Claude's offer to draft a team message and prepare this change as a PR for the User Service owners)*

> is it possible to just add the authro review to pr 45 instead *(the PR #44 review lines, which
> missed that PR's merge, are carried in this PR)*

**What it produced:** `env_file: ../.env` replaced by an explicit list of the 15 variables
`user-service/src/config.ts` reads, each taken from `.env`. Empty values are treated as unset by
the service, so a missing secret still fails at startup by name.

**What I changed or rejected:** Chose the middle ground (one root `.env`, but each container gets only
its own variables) over giving every service its own `.env`. Zi Yi (User Service owner) approved
PR #45.

**Verification:** Run by Claude Code with test secrets: the container's variables went from 29 to the
15 it reads (plus `NODE_ENV` from the Dockerfile); the whole stack started and sign-up, login, the admin
bootstrap and location CRUD all worked through the gateway, as on `main`. Then checked by me on
2026-10-01: `docker compose -f user-service/compose.yaml config` shows the container's environment
limited to `LOG_LEVEL` and the 14 `USER_*` variables, with no `env_file`.

### 2026-09-30 — Supplier Service unit and integration tests

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate
**Files:** `supplier-service/src/**/*.spec.ts`, `supplier-service/src/test/*`,
`supplier-service/jest.int.config.js`, `supplier-service/package.json`, `supplier-service/README.md`,
`.env.example`; removed `supplier-service/test/config.test.mjs` (moved to `src/config.spec.ts`)

**Scenario:** After PR #33 the Supplier Service had only three startup tests. Added tests for the
code already merged, without changing its behaviour.

**Prompts (exact):**
> okay i have merged the pr 33, so now supplier serivce. for the next pr, i want to do tdd or add
> unit tests if possible

> Tests for existing code / Unit + database tests (Recommended) / Jest, like User Service (Recommended)
> *(chosen from the options Claude offered)*

> continue with the test making

> i ran the trest suites, and manjally verified all test cases, could you now add that for my
> author review comments

**What it produced:** Jest set up as in the User Service. Unit tests (`npm test`, 157) for the
opening-hours conversion, request validation, token verification against a stub JWKS server, the
auth guard and its access_denied log, the error format and startup configuration. Integration tests
(`npm run test:int`, 51) for `LocationsService` and the seed loader against a real PostgreSQL, in a
separate `supplier_test` database that the helper refuses to use unless its name ends in `_test`.

**What I changed or rejected:** Chose tests for the existing code over a new TDD feature, unit plus
database tests over unit only, and Jest over Node's built-in runner, to match the User Service.

**Verification:** Run by Claude Code. Both suites pass. Each file was checked by deliberately breaking
the code it covers (76 changes, such as skipping the signature check or the duplicate-name check) and
confirming a test fails, then restoring it; the seven changes first missed led to extra test cases.
Also checked: the results don't change with a hostile repo-root `.env`, and the service still builds
and its Docker image runs. One full run failed because the two integration files ran in parallel on
the same database; they now run one at a time, and passed 10 runs out of 10 (the unit tests too). Then run by me on 2026-10-01: `npm test` (157 passed) and
`npm run test:int` against supplier-db (51 passed), and I verified every test case by hand.

### 2026-09-29 — Usage-log format, merge conflicts and author reviews (PRs #27, #33)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** refactor, explain
**Files:** `ai/usage-log.md`; the `Author review` lines in `.env.example`, `compose.yaml`,
`supplier-service/compose.yaml`, `supplier-service/README.md`, `supplier-service/src/common/jwks.ts`,
`supplier-service/src/config.ts`, `.github/scripts/soclaas_review.py`, `.github/workflows/codeql.yml`

**Scenario:** Resolved `ai/usage-log.md` merge conflicts on PRs #27 and #33, then removed the
disclosure block that had built up at the top of this log and moved my entries to the team template,
using Zi Yi's and Deanson's sections as the reference.

**Prompts (exact):**
> help me fix the merge conflicts in this pr https://github.com/AY2627S1-CS3219-P3/GrabFoc/pull/33

> yes colin is lihloway, and hold off merging now, until cole lin added the author review

> help me see pr33 now to see what else is there to do

> Push the fix now (Recommended) *(chosen from the options Claude offered)*

> could i check with you on why you added [the disclosure block at the top of ai/usage-log.md] and at whether
> the original usage-log.md demanded for an author review?

> also, cole lin has made the changes to pr 33 to fix the blocks, so maybe we can push from that branch rather than
> making a new pr

**What it produced:** Merge resolutions that kept every entry from both sides (Cole Lin's entries
moved under his section); the explanation that the log's own rules never ask for a disclosure block
(it came from Codex in PR #23 applying the AGENTS.md file-header rule to the log itself); this section
in the template format; and `Author review` lines written from what I actually did.

**What I changed or rejected:** Questioned the disclosure block and had it removed, since Zi Yi's
and Deanson's sections keep reviews inside each entry. Confirmed lihloway is Cole Lin before his
entries were moved, held PRs #30 and #33 until he recorded his reviews, and chose to push this to
PR #33 instead of opening a new PR.

**Verification:** Claude Code compared the entries on both sides of each merge and confirmed no text
was dropped; on PR #33 the build and Cole Lin's 3 tests passed after the merge.

### 2026-09-29 — Supplier Service Docker Compose file (PR #33)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** generate
**Files:** `supplier-service/compose.yaml`, `compose.yaml`, `.env.example`, `supplier-service/README.md`

**Scenario:** The Supplier Service had a Dockerfile but no compose file, so the root `compose.yaml`
could not start it for the D2 containerised demo.

**Prompts (exact):**
> does the suppleir service have any docker compsoe file

> okay draft it out on the most udpated supplier service pr

> *(a draft compose file from Jie Yang, written with Codex, pasted with Jie Yang's message)*
> u can jjs / add the env

**What it produced:** `supplier-service/compose.yaml` following `user-service/compose.yaml` (its own
`supplier-db` on a named volume, the image built from the repository root), its `include` in the root
`compose.yaml`, `SUPPLIER_POSTGRES_PASSWORD` in `.env.example`, and a "Run with Docker Compose" README
section. It left out the draft's `depends_on: user-service`, which breaks a standalone run and isn't
needed because the JWKS is fetched per request. Its first version passed the whole `.env` into the
container, which leaked user-db's password; it now passes only the Supplier variables.

**What I changed or rejected:** Brought in Jie Yang's draft and, following Jie Yang, gave
`supplier-db` its own password (`SUPPLIER_POSTGRES_PASSWORD`) and host port 5434. Chose PR #33 as the
branch, being the newest Supplier PR.

**Verification:** Run by Claude Code in an isolated compose project with test secrets. Standalone:
21 locations seeded, 401 without a token, 503 with one (no User Service), dev headers refused, data
kept across `down`/`up`. Whole stack: the Supplier container fetched the User Service's JWKS; tokens
signed with its key got 200 (USER), 403 (USER on `includeInactive`) and 200 (ADMIN), and a token signed
with another key got 401. SoCLaaS's claim that the root `include` leaks `.env` into the container was
checked and found wrong. I then ran `docker compose up --build` in `supplier-service/` myself: the
image built, 21 locations were seeded, the service listened on 3002 and `supplier-db` on 5434, and
`GET /locations` without a token returned 401.

### 2026-09-29 — SoCLaaS review failures and a TLS stopgap (PR #36)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** debug, generate
**Files:** `.github/scripts/soclaas_review.py`

**Scenario:** Every SoCLaaS PR Review run failed with "SoCLaaS could not be reached", while the API
still loaded in a browser.

**Prompts (exact):**
> why is soclass not working? *(with screenshots of the failed run and the API URL)*

> tyr the stopgap for the soclass o na different branch, but before you do, help me to settle this
> merge conflict on pr #27

> resolve this for pr 27, then open the pr for fix soclass tls

> okay the mcp is working now, read the review form codesx and resolv eth econversations
> accoridngly, then do the same with PR30 for user service

> for pr 36 this was commented by codex *(with a screenshot of Codex's `VERIFY_X509_PARTIAL_CHAIN` finding)*

> can you help me se ewhy soclaas is still failing *(with a screenshot of a failed run on PR #30)*

**What it produced:** The diagnosis: after its 2026-09-28 certificate renewal the server sent only its
leaf certificate; browsers fetch the missing Let's Encrypt `YE2` intermediate themselves, Python's
`urllib` does not. The stopgap embeds `YE2` and `Root YE` for SoCLaaS requests only, with certificate
verification left on, and clears `VERIFY_X509_PARTIAL_CHAIN` so the chain must still end at a system
root. The later failure on PR #30 was a 120-second timeout on a large diff, not TLS.

**What I changed or rejected:** Chose the stopgap over waiting for the SoCLaaS admins, passed on
Codex's `VERIFY_X509_PARTIAL_CHAIN` finding, and supplied my name for the code marker.

**Verification:** Claude Code tested against the live server on Python 3.11, 3.12 and 3.14, including
a check that the certificate is rejected with no system roots (it was accepted on 3.14 before the
`VERIFY_X509_PARTIAL_CHAIN` fix). After the merge, SoCLaaS reviews completed on PRs #30 and #33. The
server has since started sending its full chain, so the stopgap can be removed.

### 2026-09-29 — Fixes for PR #30's review findings (PR #30)

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** debug
**Files:** `supplier-service/src/common/jwks.ts`, `supplier-service/src/config.ts` (on Cole Lin's branch)

**Scenario:** Copilot's review of PR #30 left four findings on the Supplier Service token verification.

**Prompts (exact):**
> okay the mcp is working now, read the review form codesx and resolv eth econversations
> accoridngly, then do the same with PR30 for user service

> Approve all 3 fixes (Recommended) *(chosen from the options Claude offered)*

> are all the conversations for the pr 30 and pr 33 okay? then il lapprove it

**What it produced:** Three were real bugs: an invalid or `null` JWKS body escaped as a 500 instead of
the documented 503; concurrent requests each fetched the JWKS, defeating the 30-second refetch limit;
and `SUPPLIER_JWKS_URL` was required even in the documented dev-auth-only mode. Claude flagged the
third fix as a security trade-off before making it. The fourth finding (Cole Lin's own disclosures)
was left to him.

**What I changed or rejected:** Approved all three fixes, including the trade-off that a bearer token
sent without a JWKS URL gets 503 and is never accepted.

**Verification:** Claude Code reproduced all three bugs with a script against a stub JWKS server and
confirmed they pass after the fix; `npm run build` succeeded and CI passed. I approved and merged PR #30
after its review threads were checked.

### 2026-09-28 — CodeQL scans for pull requests to any branch (PR #27)

**Tool:** Codex (GPT-6) · **Mode:** generate
**Files:** `.github/workflows/codeql.yml`

**Scenario:** Extend the CodeQL setup below to cover feature-to-feature pull requests, including
stacked changes.

**Prompts (exact):**
> lets alter the current codeQL configuration from the current only main prs to now also include pr-to-pr

**What it produced:** Removed the `pull_request.branches` filter from `.github/workflows/codeql.yml`;
scans of pushes to `main` and the weekly schedule are unchanged. Key response: "I'll expand CodeQL to
scan PRs targeting any branch, keep the existing merge protection on `main`, and open a PR for the
change."

**Verification:** Approved by Jyang1206 and merged in PR #27. CodeQL has since run on PRs #30, #33 and
#36; not yet seen on a PR that targets a branch other than `main`.

### 2026-09-28 — CodeQL advanced setup (PR #23)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug
**Files:** `.github/workflows/codeql.yml`

**Scenario:** CodeQL's default setup did not scan fork pull requests, so PR #7 waited on a required
CodeQL result. Configure advanced setup, still scanning JavaScript/TypeScript and GitHub Actions.

**Prompts (exact):**
> assist me in configuring a more advanced version of codeQL workflow for me to customize

**What it produced:** `.github/workflows/codeql.yml`. Key response: "I'll configure the CodeQL workflow
for pull requests, then switch GitHub from default to advanced setup and check whether PR #7 receives a
scan. I'll inspect the repository settings and existing workflow first."

**Verification:** Approved by Jyang1206 and merged in PR #23. The CodeQL jobs ran successfully after
the repository switched to advanced setup.


## 2026-09-28 13:08 UTC — CodeQL advanced setup

- Tool and mode: Codex (GPT-6), generate and debug.
- Usage scenario: Configure CodeQL analysis for public fork pull requests while continuing to scan JavaScript/TypeScript and GitHub Actions.
- Exact user prompt: “lets do the configuring of a nadvanced set up”
- Key response: “I’ll configure the CodeQL workflow for pull requests, then switch GitHub from default to advanced setup and check whether PR #7 receives a scan. I’ll inspect the repository settings and existing workflow first.”
- Output: `.github/workflows/codeql.yml` in PR #23.
- Human review: Pending. The CodeQL jobs ran successfully after the repository switched to advanced setup.
