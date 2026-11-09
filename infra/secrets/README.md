<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 7).
Author review: Pending Jian Bing's review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
Scope: Notification's secrets and --add-missing (deploy part 3, #143).
Author review: Pending Jian Bing's review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: CHAT_TICKET_SECRET (chat, #230).
Author review: Pending Jian Bing's review.
-->

# Deployment secrets (never committed)

Everything in this folder except this README is git-ignored. Create one file per environment,
`staging.env` and `production.env`, in `.env` syntax (`NAME=value`). The quickest way:

```bash
infra/scripts/new-secrets.sh staging   # fresh random passwords and keys; prints no values
```

then fill in the four Gmail and admin lines it leaves empty, and load the file into AWS:

```bash
infra/scripts/put-secrets.sh staging
```

When a new secret is added to the deployment, an existing file gets it without changing anything else:

```bash
infra/scripts/new-secrets.sh staging --add-missing
infra/scripts/put-secrets.sh staging
```

Run this before the `terraform apply` that needs the secret: a task can't start if its parameter is missing.

The script stores each value as an SSM SecureString at `/foc/<env>/<NAME>`, where the ECS tasks read
it. It refuses to run if any name below is missing, and prints names only, never values.

| Name | What it is |
|---|---|
| `POSTGRES_PASSWORD` | User Service database password |
| `SUPPLIER_POSTGRES_PASSWORD` | Supplier Service database password |
| `CREDIT_POSTGRES_PASSWORD` | Credit Service database password |
| `ORDER_DB_PASSWORD` | Order Service database password |
| `NOTIFICATION_POSTGRES_PASSWORD` | Notification Service database password |
| `USER_AES_KEY`, `USER_EMAIL_HMAC_KEY`, `USER_OTP_HMAC_KEY` | User Service encryption and HMAC keys |
| `USER_JWT_PRIVATE_KEY`, `USER_JWT_KID` | User Service token signing key and its key id |
| `USER_SMTP_USER`, `USER_SMTP_PASS` | Gmail address and its app password (User and Notification send with these) |
| `USER_SMTP_FROM` | Sender shown on emails |
| `USER_BOOTSTRAP_ADMIN_EMAIL` | First admin account |
| `CREDIT_SERVICE_KEY`, `ORDER_SERVICE_KEY`, `USER_INTERNAL_SERVICE_KEY` | Service-to-service keys |
| `CHAT_TICKET_SECRET` | Signs chat tickets; Order (as `ORDER_CHAT_TICKET_SECRET`) and the chat service share it (at least 32 characters) |

Built by the script, not written by you: `USER_DATABASE_URL`, `SUPPLIER_DATABASE_URL` (from the
passwords, as the compose files build them) and `MAILPIT_SMTP_AUTH` (staging Mailpit's login).

Use different values for staging and production. Generate keys the same way as for your local `.env`.
