<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Moved Cole Lin's section out of ai/usage-log.md into this file (issue #65); entry text unchanged.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
-->

# AI Usage Log — Cole Lin

Cole Lin's entries for the FoC AI usage log. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). Add entries to this file only, newest first.

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
