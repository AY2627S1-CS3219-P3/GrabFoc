<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Documented gateway setup, Supplier routes, and current integration boundaries; listed implemented User routes on 2026-09-28.
Author review: Pending gateway owner review.
-->

# API Gateway

_Origin: AI doc; implementation of the gateway direction recorded in the project `AGENTS.md`._

The gateway routes only implemented User Service methods and paths. Public routes are `POST /auth/register`, `/auth/register/verify`, `/auth/register/resend-otp`, `/auth/login`, `/auth/refresh`, `/auth/password/forgot`, `/auth/password/reset`, and `GET /.well-known/jwks.json`. Protected User routes are `POST /auth/logout`, `GET` and `PATCH /users/me`, `GET /admin/users`, and `PATCH /admin/users/:userId/role`. The `/auth` prefix is configurable. Unknown methods and paths, including `/internal/**`, return 404.

The gateway currently verifies a User Service bearer JWT for protected requests and forwards the bearer token unchanged. It strips caller-supplied `X-User-Id` and `X-User-Role` headers. This is an interim handoff while the team decides the final service authentication contract. The upstream receives the same path and query string. The gateway does not implement sign-in, registration, OTP, profile or location authorization.

Copy the gateway variables from the root `.env.example`, set service origins, then run `npm install`, `npm run dev`. Local defaults are User Service 3001, Supplier Service 3002, and gateway 3003. Use `npm test` and `npm run build` to verify. `GET /health` reports gateway process health only. If an upstream is absent, proxy requests return 502.

Before connecting the frontend, confirm paths and payloads with User and Supplier owners. Confirm User Service's JWKS path, signing algorithm, issuer and audience. Decide whether each service re-verifies tokens or accepts gateway identity as recorded in the root `AGENTS.md`; this gateway currently forwards the bearer token and creates no identity headers.
