<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Moved Jian Bing's section out of ai/usage-log.md into this file (issue #65), plus a CodeQL entry that git blame attributes to Jian Bing from the end of Jie Yang's section; entry text unchanged. Wrote the 2026-10-12 usage-log split entry from Jian Bing's prompts.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-05
Scope: Wrote the end-to-end UI check and §9 demo-check entry under the Jian Bing section.
Author review: Jian Bing supplied the prompts quoted in that entry and checked the whole end-to-end flow locally.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
Scope: Wrote the Credit Service design and implementation entry under the Jian Bing section.
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review.
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
> help me make a new pr where we split the usage-log.md into 5 markdown, 1 for each member since as it stands, everyitme we make a pr, there is a merge conflict there, and make it track the corresponging github issue i created

> yes looks good, but i think with regards to ref, maybe we can close this issue #65, and then we open a new issue isntead ot merge this ai-usag ea tthe end isntead

> the pr reviewer left some comments for pr 68 (with screenshots of the two Codex review comments)

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

### 2026-10-11 — Credit Service design (learning mode) and first implementation

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** `credit-service/**` (new), `compose.yaml`, `.env.example` (incl. `credit-service/postman/credit.postman_collection.json`)

**Scenario:** Design the Credit Service myself in learning mode (Claude asked for my approach at
each step, explained concepts and flagged mistakes), then have Claude implement the agreed design.

**Prompts (exact):**
> /superpowers:brainstorming /Users/user/Downloads/cs3219-group3-D1.pdf  using this product document, help me plan out the order service

> sorry,  imean to do credit service isntead

> lets do path 1: where after a courier with 10 credits deliver it and completes, the order serivce will send a message to credit, whcih then releases the resevreed credits to the courier, and hence finishing the transaction, so now the ocurier will have 13 creidts, and the requester will still have 7 credits sicne to make an order, the order serivce will call the credit serivce to resevr ethe 3 credits. now when the order gets cancelled, the reserved credits in credit service go back to the requester, wher eorder service wil lmake this call

> the creidt would become 4/6 which si wrong, so we would need it to be idempotent, whic hwe can do by checking the orderid to see if its the same request, and since we know if an orderid has had its creidt reserved, we can check against this

> operation role: we have a valid state machine or transition cycle, then if 2 simualtaenous duplciates come, we write and check atomically through a transaction? i dont know if databse transaction is suitable for this thoug, but i dont want to reinvent the wheel either. also the reply shoudl definitely be success for the 1st time, but a fail on the 2nd time, but i dont think order should see an error, since the transaction can proceed if credit service does its job scope eproperly, it would be coupling to make order servic ehandle duplciate response causing an error

> yup the correct state transition was exactly what i had in mind. okay for this duplciate same order race, i think we use both the unique order id and its operation type and amout to uniquely identify if we have procsessed the order before?

> 1. order id + action only, and the amount stays as a data field ,which if the same x, reserve request comes it, with a different value, we overwrite hte prev value 2. so we use a custom record id? 3. database constraint that cen work as al ookup in code?

> what r u saying, if the overwriting isnt possible, so if the x,reverve came in 2 times, with a different amount, it means my oder service is stupdi cause it shoudlnt allow that i nthe first palce no? and also the cshape a and b the row id i jsut said? why are you repeating the same thing to me

> for 2. no i meant liek before i mentioned record id, u wanted to me to find a way to deduplicate commands, and regarldess, if we are going to do either shape a or b, isnt there still the the duplicate same-order race and the two-orders-at-once race?

> i literally was suggestin shape a from the start, did i nto mention using psotgres transaction?! thanks but i will jsut pick shape a regardless for the idempotency it provides. then for 2 orders a tonce, if they ar edifferne torders they have different uid so its already solved no? also i dont liek the fact that we r using psotgres to help handle idempotency, there has to be a better way

> okay use database, also if anythign for the 2 orders at once, im pretty sure there is a constraint where an user cant cant have mroe than 1 ongoing order at ocne, it shoudl be written i nthe project document somewhere, so this cas eshoudl even happen, why am i handling this?

> okay then nvm, lets stick to the original requirement

> conditional uupdate, add a apart that says where user.amount > requested amount

> can you implement a post for reserving credit, and a post for releasing credit, whichh all is order calling i think it makes sense, also can you go straight to implementation

> can you gime me a collection ot import with

Choices made in pickers: confirmed the design summary ("Confirm and continue"); in the
implementation plan, "Add transfer too", "X-Service-Key on /internal" and "Implement this step".

**What it produced:** Explanations of check-then-act races, what a transaction does and doesn't
guarantee, and the two ways to make a per-order record unique. After my design was confirmed, a
NestJS service with `POST /internal/credits/reserve`, `/transfer` and `/release`, a service-key
guard, the schema, Docker and compose wiring, a README and `credit-service/AGENTS.md`, plus 18 unit
and 19 integration tests (including ten identical reserves at once, five orders racing for one
balance, and transfer racing release).

**What I changed or rejected:** My design: one hold per order with states RESERVED → TRANSFERRED |
RELEASED, idempotency on order id + action with the amount as data, duplicates returning success,
PostgreSQL enforcing it, and a conditional update for the balance. Claude corrected my `>` to `>=`,
pointed out that D1 limits only couriers to one order, and talked me out of overwriting a
mismatched amount. I asked for reserve and release; Claude flagged that transfer was missing and I
added it. Claude proposed the table columns, paths, status codes and the X-Service-Key pattern,
flagged under the AI policy, and I approved them. Claude changed the compose key from `:?` to
`:-` so a missing key stops only the Credit container, not the whole stack.

**Verification:** Run by Claude Code: `npm test` 18/18 and `npm run test:int` 19/19 against
PostgreSQL in Docker. Removing the `available >= amount` condition failed 3 tests and letting
release ignore the state failed 2, so the race tests do catch those bugs. The built container
answered 401 without a key, 201 then 200 for a repeated reserve, 409 for a mismatch and for
release after transfer, and left the requester at 7/0 and the courier at 13/0. The Postman collection ran
with Newman against the container: 17 requests, 21 assertions, 0 failures.

### 2026-10-11 — Find and fill in my pending author reviews

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** explain, generate
**Files:** `AGENTS.md`, `ai/usage-log.md`

**Scenario:** List the AI disclosures still waiting on my review, then record what I checked.

**Prompts (exact):**
> help me find all the author review liens under jianbing in the repo that are missing

> help me fill up my pending review lines, i checked through hthe whole end to end flow locslly, and ensured all test cases passed, as well as overviewed the whole flow and made sure the tests amde snese, whereas the pr themselves, i skimmed through most of the code and using the copilot and codex github connectors, ran through their results and advice, and made sure they were sound before resolving the conversations

**What it produced:** Used `git grep` and `git blame` to find 21 pending Author review lines that
name me or that I committed, and two of my log entries (the CodeQL ones) that have no "What I
changed or rejected" line. It then copied my statement above into those lines: the
end-to-end check for the §9 fix, and the code skim plus Copilot and Codex review for PRs #27, #30,
#33 and #36. No code changed. The 14 lines for the PR #44 Supplier test files (and
`.env.example`) were dropped when this work was rebased onto `main`, because PR #45 had already
recorded my review of those tests on 2026-10-01.

**What I changed or rejected:** The review wording is my own statement; Claude Code only placed it.

**Verification:** `git grep` finds no Author review line still pending on me.

### 2026-10-05 — End-to-end UI check with Playwright, and a §9 demo-check fix

**Tool:** Claude Code (Claude Opus 5.5) · **Mode:** debug, generate
**Files:** `AGENTS.md`

**Scenario:** Drive the running Docker Compose stack through the browser to confirm the D2 flows
work end to end, then correct a demo instruction the check found to be wrong.

**Prompts (exact):**
> try using the playwright cli to access the ui to see if end to end works

> help me change the status=inative wording, whatever that means

**What it produced:** Using playwright-cli on `localhost:3000`, Claude signed up a USER (OTP read
from Mailpit), browsed locations with search, type filter, sort and paging, toggled requester and
courier mode, and checked the profile. The USER was redirected away from `/admin/locations` and got
403 on create, edit and `includeInactive=true`; the gateway returned 401 with no token. It claimed
the bootstrap ADMIN through Forgot Password and ran create, edit, deactivate and restore from the UI,
and checked the 390px mobile layout for horizontal overflow. It found that `AGENTS.md` §9 told the
demo to use `GET /locations?status=INACTIVE` (and `ALL`), which the Supplier Service rejects with
400; the documented parameter is `includeInactive=true`. It changed the two §9 lines to match. No
code changed. Other findings reported but not acted on: the header avatar is a hard-coded "?"
placeholder, Deactivate has no confirmation, the mobile header wraps above the logo, and the
requester/courier mode resets on navigation.

**What I changed or rejected:** Pending my review.

**Verification:** `GET /locations?includeInactive=true` returned 403 for the USER and listed the
inactive test location for the ADMIN, through the frontend proxy and the gateway.

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
> does the suppleir service have any docker compose file

> okay draft it out on the most udpated supplier service pr

> *(a draft compose file from Jie Yang, written with Codex, pasted with Jie Yang's message)*
> u can js / add the env

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
> okay the mcp is working now, read the review form codesx and resolve the conversations
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
