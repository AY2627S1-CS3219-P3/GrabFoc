<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-10
Scope: Rewrote this file. The original was the template's skeleton: placeholder team names, and a
  repository structure listing four services when the repo has nine folders of code. Replaced the
  team table from the ownership in AGENTS.md §3, the structure from the actual tree, and added the
  run steps (from docs/demo-runbook.md, which was walked against a real `docker compose up`), the
  service table, the architecture summary and the AI Use Summary the project document requires as
  this file's last section. No design decisions were made here; every statement is taken from
  AGENTS.md, the service READMEs or the repository itself.
Author review: pending - Cole Lin. The team table and the AI Use Summary describe the whole team's
  work and practice, so each member should confirm their own row and the summary's claims before
  this is submitted.
-->

# Friend on Campus (FoC)

**CS3219 — Software Design and Architecture, AY2026/27 Semester 1 · Group 3**

FoC is a peer-to-peer campus errand platform for NUS students. A **requester** creates an
**order** to have items collected from a campus **location** and delivered to a drop-off point;
a **courier** — another student — accepts it, picks the items up, delivers them, and is paid in
**credits**. Every user can act as both.

The platform runs a **closed credit economy**: credits cannot be bought, withdrawn or exchanged
for money, and only circulate inside the platform. Each new account starts with 10 credits.
Credits are *reserved* when an order is created, *transferred* from requester to courier on
completion, and *released* back to the requester on cancellation.

---

## Team

| Name | Owns |
| --- | --- |
| Cole Lin | Supplier Service, Notification Service, Centralized Logging |
| Deanson | User Service, UI mockups |
| Jian Bing | Order CRUD and listing, location browsing UI, CI and cloud deployment |
| Jie Yang | API Gateway, order acceptance and lifecycle, containerisation, real-time chat |
| Zi Yi | Credit Service, service integration, admin dashboard |

Ownership follows the project plan in [`AGENTS.md`](AGENTS.md) §3, including the three
nice-to-have reassignments recorded there. Each member stays accountable for the whole codebase.

---

## Running it locally

**You need** Docker Desktop (or Docker Engine with Compose v2) and, for running a service's tests
outside its container, Node.js 20+.

1. **Create the root `.env`.**

   ```bash
   cp .env.example .env
   ```

   A fresh copy ships every value blank, and several services refuse to start without one. The
   User Service needs `USER_AES_KEY`, `USER_EMAIL_HMAC_KEY` and `USER_OTP_HMAC_KEY` (32 bytes
   base64 each), `USER_JWT_PRIVATE_KEY` (a PKCS#8 PEM, base64 on one line) and `USER_JWT_KID`
   (any stable string). Four shared secrets — `CREDIT_SERVICE_KEY`, `USER_INTERNAL_SERVICE_KEY`,
   `CHAT_TICKET_SECRET` and `ORDER_SERVICE_KEY` — must each be at least 32 characters; the
   service that reads one rejects it below that, which shows up as a restarting container rather
   than a clear error. `.env.example` lists the variables with safe placeholders, and the
   `openssl` commands for generating the keys.

   Real values belong only in `.env`, which is git-ignored. **Never commit secrets.**

2. **Start everything.**

   ```bash
   docker compose up -d --build
   ```

   The root `compose.yaml` only `include`s each service's own, so this starts the whole stack —
   over twenty containers. Three are one-shot jobs that run and exit (`kafka-init`,
   `order-migrate`, `chat-migrate`), so `docker compose ps` lists fewer than it started. The
   first build is slow.

3. **Check it came up.**

   ```bash
   docker compose ps
   ```

   Everything should be `Up`, with the databases, Kafka and mailpit also `(healthy)`. If a
   service is `Restarting`, read it with `docker compose logs <service> | grep -i error` — in
   practice that has always been a missing value from step 1.

Then open the frontend at **http://localhost:3000**. The API Gateway is on **:3003** and is the
only way in to the services; a mail inbox (mailpit) is on **:8025** and Kafka UI on **:8085**.

[`docs/demo-runbook.md`](docs/demo-runbook.md) walks the whole flow end to end — claiming the
first admin, placing and completing an order, and reading the logs — and was written against a
real `docker compose up`.

---

## Services

Each service owns its **own database** and is reachable only through the API Gateway. Every
folder has its own `AGENTS.md` (its schema, API and rules), and all but `user-service/` have a
`README.md` covering how to run and test it.

| Folder | What it does |
| --- | --- |
| [`api-gateway/`](api-gateway/) | The single entry point. Envoy; authenticates every request against the User Service's JWKS and routes it on. |
| [`user-service/`](user-service/) | Accounts, sign-in, OTPs, refresh tokens, roles. Issues the access tokens everything else trusts. |
| [`supplier-service/`](supplier-service/) | The campus location catalogue: browse, search, filter, paginate; admin-only create, edit, deactivate and restore. |
| [`order-service/`](order-service/) | The order lifecycle, from `PENDING` to `COMPLETED` or `CANCELLED`, and the events it publishes. |
| [`credit-service/`](credit-service/) | Credit accounts and the reserve / transfer / release operations, kept atomic and idempotent. |
| [`notification-service/`](notification-service/) | Consumes order-state events and emails the right party. Stores almost nothing. |
| [`logging-service/`](logging-service/) | Centralized log store (N2H): one queryable place for structured lines from every service. |
| [`chat-service/`](chat-service/) | Real-time requester–courier chat (N2H), over a socket authorised by a short-lived ticket. |
| [`frontend/`](frontend/) | The Next.js web app: browsing, ordering, courier mode, profile and the admin screens. |

---

## Repository structure

The repo follows the template's **one-service-per-folder** rule: every service is its own
top-level folder, with no `backend/` wrapper.

```text
.
├── api-gateway/           # Envoy; the only public entry point
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── notification-service/
├── logging-service/       # nice-to-have
├── chat-service/          # nice-to-have
├── frontend/
├── data/
│   ├── csv/               # Supplier seed data (from the template)
│   └── images/            # location images for the seed data
├── infra/
│   ├── kafka/             # the shared broker and its topic list
│   └── terraform/         # AWS deployment
├── docs/                  # designs, plans and the demo runbook
├── ai/usage-log/          # per-member AI usage logs
├── compose.yaml           # includes each service's own compose.yaml
├── .env.example
├── AGENTS.md
└── README.md
```

- Any nice-to-have that warrants its own service becomes **another top-level folder**, following
  the same structure.
- Files for agentic coding tools (agent notes, prompts, skills) may be added anywhere, but core
  implementation must stay inside the service folders.

---

## Architecture

- **Microservices, a database per service.** No service reads another's database, and there are
  no cross-service foreign keys.
- **The API Gateway authenticates; each service authorizes.** The gateway verifies the JWT
  against the User Service's JWKS endpoint and rejects anything unsigned or expired with a 401.
  Role and ownership checks live in the services themselves, which answer 403.
- **Synchronous HTTP between services** for reads and for reserving credits.
- **Kafka for the asynchronous flows**: Order publishes order-state events, and transfer and
  release commands to Credit. Consumers are idempotent and commit an offset only after their
  work is saved, so a redelivery changes nothing twice.
- **TypeScript on Node.js**, with Zod validating every request body strictly and parameterized
  queries for all database access.
- **PostgreSQL** for every service that stores data.

[`AGENTS.md`](AGENTS.md) is the project-wide design record — terminology, roles, the messaging
rules and the open questions. Each service's own `AGENTS.md` holds its schema, API and edge
cases. Longer design documents are in [`docs/`](docs/).

---

## Deployment

The stack also runs on AWS — ECS on EC2, one task per service, with CloudFront in front of the
gateway as the only public path. The Terraform lives in [`infra/terraform/`](infra/terraform/);
its README covers the environments, the secrets and the first deploy.

---

## AI Use Summary

This project was built with AI coding assistants, under the course AI policy (Appendix 2 of the
project document). This section is required by that policy; the full record is in
[`ai/usage-log.md`](ai/usage-log.md) and the per-member logs it indexes.

**Tools used.** Claude Code (Anthropic Claude Opus 5 and 5.5), OpenAI Codex (GPT-6), and GitHub
Copilot and Codex as automated pull-request reviewers. A SoCLaaS reviewer also comments on pull
requests.

**What AI was used for.** Implementing code from designs the team had already settled;
boilerplate and configuration; tests; debugging; refactoring; documentation; and reviewing pull
requests. Day-to-day work is recorded per member in [`ai/usage-log/`](ai/usage-log/), with the
date, tool, mode, the exact prompts, the key responses, and what the member changed, rejected or
verified.

**Phases AI was kept out of.** The policy restricts AI from design work. The repository enforces
this as a documented rule rather than a convention: [`AGENTS.md`](AGENTS.md) requires an agent to
**warn and stop for human confirmation** before proposing or changing system architecture,
service boundaries, design patterns, data schemas, interfaces (endpoints, parameters, response
shapes, event names or payloads), or performance and security trade-offs — and before writing
decision rationales or doing backlog work beyond formatting. Every heading in `AGENTS.md` carries
an **origin label** (`Team`, `Restated` or `AI doc`) saying whether its content is the team's own
decision, a restatement of the brief, or process text written by AI, so that nothing written by
AI is presented as the team's design.

**How outputs were verified.** Three mechanisms, all visible in the history:

- **Attribution in the files themselves.** Every AI-influenced file carries a disclosure header
  naming the tool, model, date, scope and what the human reviewed; AI-written blocks carry an
  inline marker. `ai/check-disclosures.py` checks that a branch's changed files gained an entry.
- **Human review before merge.** Every change goes through a pull request. A member reads, runs
  and understands it before it merges; the disclosure header records what they checked, and says
  `pending` until they have.
- **Tests and automated review.** Services carry unit and integration test suites. CI runs unit
  tests and builds per service, several services' integration tests against PostgreSQL in Docker
  rather than a substitute, CodeQL, and the frontend's lint and build; the remaining suites, such
  as the frontend's browser route tests, are run by hand. Automated reviewers comment on each
  pull request, and their findings are answered and resolved rather than dismissed.

Each member remains accountable for the whole codebase, including the parts an assistant wrote.
