<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Documented gateway implementation boundaries and pending service contract decisions.
Author review: Pending gateway owner review.
-->

# API Gateway agent notes

_Origin: AI doc; implements the project-wide gateway direction in `../AGENTS.md`._

- The gateway is the frontend's entry point and verifies bearer access tokens against User Service JWKS for protected routes.
- User Service owns registration and sign-in. Supplier Service owns location data and authorization. Do not add business logic or persistent data here.
- Current route prefixes are configuration placeholders pending service-owner contract confirmation. Keep upstream paths unchanged unless the owners agree on a mapping.
- Do not log credentials, tokens or personal data. Log 401/403 attempts in structured form without sensitive values.
- The project has not settled whether each service re-verifies JWTs or trusts gateway identity headers. This gateway forwards the bearer token and does not create identity headers.

Before gateway changes, read the project `AGENTS.md` and the plan in `../docs/frontend-gateway-implementation-plan.md`.
