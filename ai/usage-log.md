<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Generated this AI usage log entry for the CodeQL workflow configuration.
Author review: Pending human review on PR #23.
AI-generated log entry; human review pending.
-->

# AI usage log

## 2026-09-28 13:08 UTC — CodeQL advanced setup

- Tool and mode: Codex (GPT-6), generate and debug.
- Usage scenario: Configure CodeQL analysis for public fork pull requests while continuing to scan JavaScript/TypeScript and GitHub Actions.
- Exact user prompt: “lets do the configuring of a nadvanced set up”
- Key response: “I’ll configure the CodeQL workflow for pull requests, then switch GitHub from default to advanced setup and check whether PR #7 receives a scan. I’ll inspect the repository settings and existing workflow first.”
- Output: `.github/workflows/codeql.yml` in PR #23.
- Human review: Pending. The CodeQL jobs ran successfully after the repository switched to advanced setup.

## 2026-09-22 — Supplier Service: first implementation

- Tool and mode: Claude Code (Claude Opus 5), generate, debug and document.
- Usage scenario: Build the Supplier Service from the design the team had already settled in `supplier-service/AGENTS.md` (schema, endpoints, error codes, seed rules). The team chose the stack and every open design point in conversation before any code was written: NestJS, `pg` with plain SQL, a dev-only header guard, and JSON field names matching the columns.
- Exact user prompts (in order): "ok are you able to start building it such that I can test with seed and postman first?"; "the Supplier Service files and .env.example together, leaving out the other services' AGENTS.md files is perfect and exactly what I was thinking"; "push it and open a PR".
- Key response: generated the NestJS service (config, database module, Problem Details filter, dev-only guard, Zod schemas, locations controller/service, CSV seed loader), a Postman collection and the README, then ran it against PostgreSQL and reported the 27 checks that passed.
- Output: `supplier-service/**` and the Supplier entries in `.env.example`, in PR #7 (merged).
- Human review: Pending. Every generated file carries an AI Assistance Disclosure header with "Author review: pending"; the team member reviewing the code completes those lines.

## 2026-09-26 — Supplier Service: `.env` loading fix after automated review

- Tool and mode: Claude Code (Claude Opus 5), debug and fix.
- Usage scenario: The SoCLaaS review on PR #7 reported that `process.loadEnvFile` needs Node 22.12+, so on older versions the `.env` file was silently ignored and startup failed with a confusing "missing environment variable".
- Exact user prompt: "fix point 3 by adding version check?"
- Key response: added an explicit check that names the file and the required Node version, and declared `engines.node >= 22.12` in `package.json`; verified both the old-Node and current-Node paths.
- Output: `supplier-service/src/config.ts`, `supplier-service/package.json`, in PR #7.
- Human review: Pending.

## 2026-09-28 — Supplier Service: sorting, Dockerfile, token verification, coordinate search

- Tool and mode: Claude Code (Claude Opus 5), generate, debug and document.
- Usage scenario: Four pieces of work, each preceded by the team deciding the interface. Sorting: the team chose A→Z and Z→A only, leaving ordering by type or building pending. Dockerfile: the team chose the repo-root build context (so the image can copy the seed CSV), ports 3002 and 5433, and following `user-service/Dockerfile`'s two-stage pattern. Auth: after reading the gateway's code, which forwards the token and injects no identity headers, the team chose hand-rolled `node:crypto` verification, removal of the dev headers, issuer/audience checked only when configured, and testing with local keys; the team then asked for an opt-in dev fallback so the service can still be tested alone. Coordinate search: the team chose distance ordering rather than a radius filter, a `distance_m` field, and `order` gaining a `distance` value.
- Exact user prompts (in order): "add sorting A->Z and Z<-A"; "i thinking of making our dockerfile"; "ok so for API gateway stuff, right now I believe we have sort of a placeholder, but we should be able to flesh it out now that we know how the gateway is implemented right?"; "ok I actually now want to be able to test supplier alone, add back the dev-only X-User-Id / X-User-Role headers and make sure no security problems, only for testing"; "add the finding suppliers by location, given a coordinate. Just assume it will be a standard mobile gps location format"; "we changed a lot with this, I want you to check through and figure out if its all good".
- Key responses: implemented `order=asc|desc`; wrote the two-stage Dockerfile and a root `.dockerignore`, built the image and ran it against PostgreSQL on a Docker network; replaced the dev guard with JWKS verification in `src/common/jwks.ts` (RS256/ES256, `exp`/`nbf`, optional `iss`/`aud`, 5-minute key cache); added `SUPPLIER_DEV_AUTH`, accepted only when no bearer token is sent and refused when `NODE_ENV=production`; added `lat`/`lon` with a great-circle distance computed in SQL; then reviewed the whole change set and found that `SUPPLIER_JWKS_URL` was still required in dev mode, and fixed it.
- Output: PR #28 (sorting, Dockerfile), PR #30 (token verification, dev fallback) and the coordinate-search branch.
- Human review: Pending. Testing was against local RS256 test keys and a JWKS stub, not the real User Service, which is not merged yet.

## 2026-09-28 — Supplier Service: usage-log entries (seed-image change reverted)

- Tool and mode: Claude Code (Claude Opus 5), document and refactor.
- Usage scenario: After a review of the whole Supplier change set, two follow-ups the team asked for: record the Supplier work in this log, and stop the seeded image links depending on the template repository.
- Exact user prompts: "anything you want to flag to me? problems with our implementation or things to flag to the team like our PR #30 just now"; "do 2 and 8"; "forget the prof repo, do 2 and 8".
- Key response: wrote the Supplier entries in this file, then changed the seed loader to keep each image's file name and serve it from this repository's own `data/images` copy, with the base configurable through `SUPPLIER_SEED_IMAGE_BASE`.
- Output: `ai/usage-log.md`. The seed-image change was **reverted at the team's request**, so the loader still rewrites the template repository's page links to their raw equivalents, as before.
- Human review: Pending.
