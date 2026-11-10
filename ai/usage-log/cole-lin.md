<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Rewrote this log from entry-by-entry records (with exact prompts) into a high-level summary
  per service: what Cole Lin and the AI discussed and built, and the key decisions. Prompts were
  removed at Jie Yang's request. The full entry-by-entry log is kept in git history at commit
  32bbb85 (`git show 32bbb85:ai/usage-log/cole-lin.md`).
Author review: Human reviewed. Confirmed by every member (recorded by Jie Yang, 2026-11-10).
-->

# AI Usage Log: Cole Lin

High-level summary of Cole Lin's AI use, grouped by service. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). The full log with every prompt is in git history at commit
`32bbb85`.

- **Period:** 2026-09-22 to 2026-11-10
- **Tool:** Claude Code (Claude Opus 5)
- **Modes:** generate, debug, review, explain
- **Review status:** ✅ Human reviewed (all sections)

## Supplier Service ✅ Human reviewed

_2026-09-22 to 2026-11-10 · PRs #7, #28, #30, #33, #145, #239_

**What was discussed and built**
- The first version of the service from the design already agreed in `supplier-service/AGENTS.md`:
  location CRUD, search, the CSV seed (21 locations), Problem Details errors, the role guard, Zod
  validation and a Postman collection.
- A-Z / Z-A sorting, the service's Dockerfile, coordinate search (`lat`/`lon`, `distance_m`,
  `order=distance`) and verification of User Service tokens through JWKS.
- Correlation ids (`x-request-id`) and a structured `request_completed` line for every request.
- A security sweep for bug classes first found on the Logging Service: the JWKS key filter
  (`key_ops`, algorithm confusion, refetch limits), control characters in filters and names, and
  validation of `image_url`.
- A looser building filter (case-insensitive partial match, like the name filter).

**Key decisions (Cole Lin)**
- NestJS with `pg` and plain parameterised SQL; no ORM (Prisma, Drizzle, Knex rejected).
- Hours stored as minutes, entered as `HHMMhrs`; opening and closing times both present or both absent.
- Build the image from the repo root so it includes the seed CSV.
- Hand-rolled `node:crypto` token checks, no new dependency; issuer and audience checked only when
  configured; dev identity headers only behind a flag and never alongside a real token.
- A coordinate adds distance and ordering only, no radius filter or "nearest N".
- A malformed request id is replaced, never rejected.
- Request lines are logged from middleware, not an interceptor, so refused requests are logged too;
  both `request_completed` and `access_denied` are kept (backlog U5.1.1).
- Loosen the building filter rather than build a dropdown (no new endpoint or gateway route).
- The same JWKS gap in the Credit Service was flagged to its owner, not changed.

## Logging Service (Centralized Logging N2H, issue #52) ✅ Human reviewed

_2026-10-21 to 2026-11-10 · PRs #129, #157, #200, #223, #233, #234_

**What was discussed and built**
- The log store: a `log_lines` table, an ADMIN-only `GET /logs`, 30-day purge, Kafka ingest with a
  dead-letter topic, and a shared log shipper that each service copies.
- Many review rounds hardening it: redacting field names as well as values, byte limits, characters
  PostgreSQL cannot store, timestamp precision, consumer and producer shutdown races, and a startup
  retry when the broker is not ready.
- A test that fails if any service's copy of the shipper drifts from the canonical one.
- Three finished pieces of work found uncommitted in sync-conflict copies, updated and committed.
- Deployment on AWS (its own database, image repository and secret) and a `GET /logs` route through
  the gateway, with startup checks that no two services' gateway routes overlap.
- `ai/check-disclosures.py`, which lists changed files whose disclosure header gained no entry.

**Key decisions (Cole Lin)**
- Line format: each service names itself in `service`, ISO-8601 UTC `ts`, Envoy-aligned field
  names, `x-request-id` for tracing and `eventId` for idempotency.
- Corrected the AI's first ingest design (Envoy cannot write to Kafka): services log through Kafka,
  the gateway to stdout, with that gap written down.
- 30-day retention; deduplicate lines on insert.
- Replace an unsafe field name with an ordinal (`[key 1]`), ending six rounds of bounding what a
  caller could put in the marker.
- Move the Logging Service's host ports (3007/5437) when they clashed with Notification's.
- The gateway authenticates `/logs` and the Logging Service authorises it; no wider route set.

## Logging in the other services ✅ Human reviewed

_2026-11-08 to 2026-11-09_

**What was discussed and built**
- The User, Credit, Order and Notification Services and the API Gateway all ship log lines to the
  store; Order and User forward `x-request-id` on their calls, so one order can be traced across services.
- No log publisher under a test runner, `.dockerignore` rules in every build context, and a Logging
  section in each service's `AGENTS.md`.

**Key decisions (Cole Lin)**
- Do the gateway change and all recommended fixes in one PR; keep fixing review findings until none are left.

## Repository documentation ✅ Human reviewed

_2026-11-10_

- Rewrote the root `README.md` (product, team, run steps, services, repository tree, architecture,
  deployment), taken from existing docs and config. Cole Lin had the AI Use Summary section and the
  disclosure header taken out of the README.
