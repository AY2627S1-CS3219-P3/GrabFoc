<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Document the stock Envoy runtime and user-approved behaviour differences on 2026-10-13.
Author review: Jie Yang reviewed earlier notes; Envoy approach approved by the user, new documentation review pending.
-->

# API Gateway agent notes

_Origin: AI doc; implements the project-wide gateway direction in `../AGENTS.md`._

- The gateway is the frontend's entry point and verifies bearer access tokens against User Service JWKS for protected routes.
- User Service owns registration and sign-in. Supplier Service owns location data and authorization. Do not add business logic or persistent data here.
- Route only the implemented User and Supplier methods and paths. The `/auth` and `/locations` prefixes remain configurable; keep upstream paths unchanged.
- Compose packages the official Envoy v1.38.6 image with `Dockerfile.envoy`. `envoy/render.py` renders routes and startup configuration. The user accepted stock JWT/error/request-ID behaviour on 2026-10-13; differences are in `envoy/behaviour-differences.md`. The gateway checks public versus authenticated access, not service roles.
- The existing `src/` Node implementation and its tests are retained as the migration reference. Do not remove them until the stock Envoy integration tests pass and the human requests removal.
- Normal Compose builds use the official precompiled binary. There are no native patches, Bazel builds, helper service or custom-image release workflow.
- Gateway configuration loads `api-gateway/.env` when present; existing process environment variables take precedence. Do not read another service's `.env`.
- Do not log credentials, tokens or personal data. Log 401/403 attempts in structured form without sensitive values.
- The project has not settled whether each service re-verifies JWTs or trusts gateway identity headers. This gateway forwards the bearer token and does not create identity headers.

Before gateway changes, read the project `AGENTS.md` and the plan in `../docs/frontend-gateway-implementation-plan.md`.
