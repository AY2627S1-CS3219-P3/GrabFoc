<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 7).
Author review: Pending Jian Bing's review.
-->

# Deployment secrets (never committed)

Everything in this folder except this README is git-ignored. Create one file per environment,
`staging.env` and `production.env`, in `.env` syntax (`NAME=value`), then load it into AWS:

```bash
infra/scripts/put-secrets.sh staging
```

The script stores each value as an SSM SecureString at `/foc/<env>/<NAME>`, where the ECS tasks read
it. It refuses to run if any name below is missing, and prints names only, never values.

| Name | What it is |
|---|---|
| `POSTGRES_PASSWORD` | User Service database password |
| `SUPPLIER_POSTGRES_PASSWORD` | Supplier Service database password |
| `CREDIT_POSTGRES_PASSWORD` | Credit Service database password |
| `ORDER_DB_PASSWORD` | Order Service database password |
| `USER_AES_KEY`, `USER_EMAIL_HMAC_KEY`, `USER_OTP_HMAC_KEY` | User Service encryption and HMAC keys |
| `USER_JWT_PRIVATE_KEY`, `USER_JWT_KID` | User Service token signing key and its key id |
| `USER_SMTP_USER`, `USER_SMTP_PASS` | Gmail address and its app password |
| `USER_SMTP_FROM` | Sender shown on emails |
| `USER_BOOTSTRAP_ADMIN_EMAIL` | First admin account |
| `CREDIT_SERVICE_KEY`, `ORDER_SERVICE_KEY` | Service-to-service keys |

Built by the script, not written by you: `USER_DATABASE_URL`, `SUPPLIER_DATABASE_URL` (from the
passwords, as the compose files build them) and `MAILPIT_SMTP_AUTH` (staging Mailpit's login).

Use different values for staging and production. Generate keys the same way as for your local `.env`.
