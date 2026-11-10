<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Rewrote this log from entry-by-entry records (with exact prompts) into a high-level summary
  per service: what Jian Bing and the AI discussed and built, and the key decisions. Prompts were
  removed at Jie Yang's request. The full entry-by-entry log is kept in git history at commit
  32bbb85 (`git show 32bbb85:ai/usage-log/jian-bing.md`).
Author review: Human reviewed. Confirmed by every member (recorded by Jie Yang, 2026-11-10).
-->

# AI Usage Log: Jian Bing

High-level summary of Jian Bing's AI use, grouped by service. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). The full log with every prompt is in git history at commit
`32bbb85`.

- **Period:** 2026-09-28 to 2026-11-10
- **Tools:** Codex (GPT-6) at first, then Claude Code (Claude Opus 5.5)
- **Modes:** explain (often a learning mode, where he made the design calls), generate, debug
- **Review status:** ✅ Human reviewed (all sections)

## CI, code scanning and review tooling ✅ Human reviewed

_2026-09-28 to 2026-11-09_

**What was discussed and built**
- CodeQL scanning on every PR, and a CI workflow running each service's tests and build.
- The SoCLaaS PR review script: a certificate stopgap, longer timeouts and retries, streamed reviews
  so the server's two-minute limit no longer cuts them off, and safe limits on review length.
- The usage log split into one file per member.
- Repairs to main's CI after Dependabot major upgrades (NestJS, Zod).
- Outside GitHub Actions that can sign in to AWS pinned to exact versions, kept current by Dependabot.

**Key decisions (Jian Bing)**
- Stay on Zod 4 (Zod 3 has an unpatched security advisory); keep NestJS on 11 with a patched dependency.
- Bound the review's length rather than remove the cap (flagged in a security review).
- Pin actions and add Dependabot, instead of leaving them on movable tags.

## Supplier Service ✅ Human reviewed

_2026-09-29 to 2026-11-10_

**What was discussed and built**
- Fixes for review findings on token verification, the service's Compose file, and unit and
  database tests, each checked by breaking the code on purpose.
- An end-to-end browser check of the D2 flows, which corrected a demo instruction.
- Location photos served from S3 instead of the course template's GitHub.

**Key decisions (Jian Bing)**
- Each container gets only its own environment variables.
- Photos in a private bucket per environment, read only through that environment's CloudFront.

## User Service ✅ Human reviewed

_2026-10-01 to 2026-11-08_

- The User container now receives only its own variables.
- A migration for schema changes that had been edited into the first migration in place.
  **Decision:** a migration rather than a manual fix or resetting staging's database.

## Credit Service ✅ Human reviewed

_2026-10-11 to 2026-10-22_

**What was discussed and built**
- The credit design in learning mode (he decided, the AI explained and challenged), then reserve,
  transfer and release with tests for concurrent requests.
- A redesign: balance reads, wallets created from `UserRegistered`, Kafka retries and dead-letter
  handling, a transaction history table and route, and transfer and release as Kafka commands only.

**Key decisions (Jian Bing)**
- One credit hold per order; repeated requests are safe; the database enforces it.
- Reserve is synchronous; transfer and release are asynchronous; Credit only moves and reports credits.
- Wallets come only from `UserRegistered`, never created on the fly.
- Kafka, chosen with Jie Yang, with shared rules: commands go to the receiver's topic, topics are
  created centrally from one list, each consumer has its own dead-letter topic.
- Stuck transfers go to a dead-letter queue for a human to replay, not auto-fixed.
- An append-only transaction table as the audit record.
- Remove the HTTP transfer and release routes (team consensus, mentor validated).

## Cloud deployment (N2H) ✅ Human reviewed

_2026-10-14 to 2026-11-10 · issues #58, #141–#143, PRs #146, #156, #191_

**What was discussed and built**
- The AWS deployment design, then Terraform for the whole stack on one ECS server per environment
  behind CloudFront.
- Routing at the edge: the gateway accepts only CloudFront traffic and sends `/gateway/*` to the API,
  everything else to the website.
- Continuous delivery: every merge to `main` builds the images once, deploys to staging and runs
  checks; production deploys the tested version after approval. The Notification and chat services
  were added to the deployment.
- Fixes found in live runs: server size, Kafka health checks and CPU, and service start order.
- The production environment.

**Key decisions (Jian Bing)**
- ECS on EC2 with Terraform, one server and one public subnet per environment, databases and Kafka
  as containers on one disk with daily backups; rejected Fargate, RDS, MSK and NAT on cost.
- CloudFront provides HTTPS (there is no domain for a certificate); a `/gateway` path prefix.
- Single AWS account; staging deploys on merge, production on manual approval.
- Larger servers (t3.xlarge) for staging and production instead of deploying apps one at a time.
- A manual restart step on first deploy instead of an automatic one.
