<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Document the Envoy runtime, per-service routes, standard Dockerfile and user-approved removal of the legacy Node gateway. Includes the approved JWKS 503 exception.
Author review: Jie Yang reviewed earlier notes; Envoy approach approved by the user, new documentation review pending.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the Credit balance and history routes to the routing rule (#61), as approved by Jie Yang.
Author review: pending — Jie Yang to record the review.
-->

# API Gateway agent notes

_Origin: AI doc; implements the project-wide gateway direction in `../AGENTS.md`._

- The gateway is the frontend's entry point and verifies bearer access tokens against User Service JWKS for protected routes.
- User Service owns registration and sign-in. Supplier Service owns location data and authorization. Do not add business logic or persistent data here.
- Route only the implemented User and Supplier methods and paths, plus Credit's two read routes (`GET /credits/:userId` and `GET /credits/:userId/transactions`, approved by Jie Yang on 2026-10-22). Never route Credit's `/internal/credits/**` or `/admin/credits/**`. The `/auth`, `/locations` and `/credits` prefixes remain configurable; keep upstream paths unchanged.
- Compose packages the official Envoy v1.38.6 image with `Dockerfile`. `envoy/render.py` renders routes and startup configuration. The user accepted stock JWT/error/request-ID behaviour on 2026-10-13; differences are in `envoy/behaviour-differences.md`. The gateway checks public versus authenticated access, not service roles.
- User-approved exception: confirmed JWKS fetch/parse failures and empty/unusable key sets return 503, using verifier metadata in the Lua response filter. Invalid tokens and unknown key IDs retain authentication errors. Regression-test failure codes against the pinned Envoy image when upgrading.
- Envoy service routes live in `envoy/routes/*.routes.json`, loaded in filename order. Declare the service name, its URL environment variable and explicit methods/paths there; JWT is required unless `public` is explicitly true. Add approved service routes through these files rather than hard-coding them in the renderer. See `envoy/README.md` for prefixes and tests.
- The user requested removal of the legacy Node gateway on 2026-10-13 after Envoy integration checks passed. Envoy is the only gateway implementation. Integration tests use Node built-ins as fixtures, not as a gateway runtime; no npm dependencies or TypeScript build are needed.
- Normal Compose builds use the official precompiled binary. There are no native patches, Bazel builds, helper service or custom-image release workflow.
- Gateway configuration loads `api-gateway/.env` when present; existing process environment variables take precedence. Do not read another service's `.env`.
- Do not log credentials, tokens or personal data. Log 401/403 attempts in structured form without sensitive values.
- The project has not settled whether each service re-verifies JWTs or trusts gateway identity headers. This gateway forwards the bearer token and does not create identity headers.

Before gateway changes, read the project `AGENTS.md` and the plan in `../docs/frontend-gateway-implementation-plan.md`.
