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

| Member | Core service | Nice-to-have |
| --- | --- | --- |
| Cole Lin | Supplier | Logging Service |
| Jian Bing | Supplier, Credit | Cloud deployment, CI/CD |
| Jie Yang | Gateway, Frontend, Order | Notification Service |
| Zi Yi | User, Order | Admin dashboard |
| Deanson | User, Frontend | Real-time chat |

This is how the work was actually divided, which differs in places from the original plan in
[`AGENTS.md`](AGENTS.md) §3. Each member stays accountable for the whole codebase.

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
├── ai/usage-log.md        # the team's AI usage log
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
