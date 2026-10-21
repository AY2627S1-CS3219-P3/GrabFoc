<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Moved Cole Lin's section out of ai/usage-log.md into this file (issue #65); entry text unchanged.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
-->

# AI Usage Log — Cole Lin

Cole Lin's entries for the FoC AI usage log. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). Add entries to this file only, newest first.

### 2026-10-21 — The Logging Service, and Supplier producing lines for it (issue #52)

- Tool and mode: Claude Code (Claude Opus 5), generate and review.
- Usage scenario: Build the Centralized Logging N2H I was assigned: the store, its ADMIN-only query API, and the shipper module every service copies to emit lines. Supplier is the first service to use it.
- Prompts (exact):
  - "ok now start on the logging service itself" — with my answers to the four open schema questions: an explicit `service` field written by each service; `ts` as ISO-8601 UTC (Envoy needs `"ts": "%START_TIME%"`, which is request start, while the Node gateway logs on finish); align Envoy's field names; and `x-request-id` as the Kafka header for tracing, with `eventId` staying the idempotency and dead-letter key. Plus: "flag any potential problems you see".
  - My corrections to the first ingest proposal: Envoy cannot produce to Kafka (its access loggers are stdout/file, gRPC ALS and OpenTelemetry), so the gateway stays stdout-only and services log through Kafka; "nothing can slow a request down" is not the argument because a non-awaited HTTP POST also stays out of the request path — buffering is; the Kafka client is a real cost for every service; and at-least-once delivery means expecting duplicate rows.
  - "finish it all first"
- Key response: `logging-service/` with the `log_lines` table, a Kafka-ready ingest path behind an interface, the ADMIN-only `GET /logs`, a 30-day purge, and `src/client/log-shipper.ts` for other services to copy. Supplier's three log lines now go through its copy of the shipper.
- What I changed or rejected: Rejected the first ingest design outright — it assumed Envoy could produce to Kafka, and it argued for Kafka on the wrong grounds. Chose the hybrid (services on Kafka, gateway on stdout) knowing it leaves the gateway's `request_completed` line out of the store, and had that gap written down rather than glossed. Chose a `lineId` with deduplication on insert over accepting approximate counts. Set retention to 30 days, shorter than the 90 for `location_changes`, because these rows hold a user id, a path and a timestamp together. Refused a dev-auth header fallback on the query API even though Supplier has one. Declined to add the Kafka topic to `infra/kafka/topics.txt` or to switch the services to Nest's JSON logger in this change: the first is Jian Bing's file, the second affects every service.
- Verification: `npm test` in both services (74 logging, 177 Supplier) and `npm run build` in both. The logging integration tests (16, against a real PostgreSQL in the `logging-db` container) passed on 2026-10-16; Docker was not running on the 21st, so they and Supplier's 51 have not been re-run since the shipper change — neither touches the database layer.

### 2026-10-16 — Request-id correlation in Supplier, and the convention for every service (PR #90, issue #52)

- Tool and mode: Claude Code (Claude Opus 5), generate and review.
- Usage scenario: Start the Centralized Logging N2H (#52). Before building anything, work out what the service actually is and what it needs from the other five services, then close the one gap that needed no one else's agreement.
- Prompts (exact):
  - "I want to start work on the logging service. Ask any questions you need, and if these questions require other services input, let me know as well as I need to coordinate with my team on when they are doing these parts. You can start with a quick excerpt on what you think the logging service is."
  - "ok I should have an issue assigned now, give me the todo for the service and any fixes"
  - "will I have to do this for the other services"
  - "write the convention and post it on 52"
- Key response: Pointed out that the gateway mints and forwards `x-request-id` but no service downstream reads it, so log lines from different services cannot be matched at all. Added `src/common/request-id.ts` to Supplier (validate, mint, echo, log) and put `requestId` on the denial, JWKS-503 and unhandled-500 lines. Drafted the cross-service convention posted on #52.
- What I changed or rejected: Rejected opening the same PR into the other five services — User is being rewritten (#62), Order has no `src/` yet (#66) and Credit is mid-review (#84, #85), so a written convention plus one reference implementation is cheaper than five rebases. Chose to replace a malformed id rather than reject the request, since a diagnostic header must not turn a working call into a 400. Had the failure message dropped from the 500's structured line after seeing that the message can carry a connection string and these lines are headed for a queryable store. Left the open questions on #52 open rather than answered, because they are the team's to settle. After the automated reviews on PR #90, took the three findings I agreed with (query strings reaching the logs, the JWKS failure message in the structured line, and 500s raised as an `HttpException` logging nothing) and declined to switch the service to Nest's JSON logger in the same PR: that changes every line in every service, so it is recorded as an open question on #52 and the doc claim was corrected instead.
- Verification: Ran `npm test` (176 passed, 7 suites; 157 before this change) and `npm run build`. Checked a supplied id, a minted one and a rejected one all reach the log line and the response header. Pulling `main` first also showed the naive version would have broken three of Jian Bing's existing tests. Also ran `npm run test:int` against the `supplier-db` container (51 passed). The review fixes added four cases, including one asserting a caller's coordinates never reach a log line. A Postman pass against the running service is still outstanding.

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
