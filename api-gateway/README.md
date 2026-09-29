<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Documented gateway setup and integration boundaries; clarified gateway-local .env loading on 2026-09-28 and added Compose setup on 2026-09-29.
Author review: Jie Yang reviewed this file.
-->

# API Gateway

_Origin: AI doc; implementation of the gateway direction recorded in the project `AGENTS.md`._

The gateway routes only implemented User Service methods and paths. Public routes are `POST /auth/register`, `/auth/register/verify`, `/auth/register/resend-otp`, `/auth/login`, `/auth/refresh`, `/auth/password/forgot`, `/auth/password/reset`, and `GET /.well-known/jwks.json`. Protected User routes are `POST /auth/logout`, `GET` and `PATCH /users/me`, `GET /admin/users`, and `PATCH /admin/users/:userId/role`. The `/auth` prefix is configurable. Unknown methods and paths, including `/internal/**`, return 404.

Supplier routes are `GET /location-types`, `GET` and `POST /locations`, `GET` and `PATCH /locations/:locationId`, and `POST /locations/:locationId/deactivate` or `/restore`. All require a valid User Service bearer JWT. The `/locations` prefix is configurable.

The gateway currently verifies a User Service bearer JWT for protected requests and forwards the bearer token unchanged. It strips caller-supplied `X-User-Id` and `X-User-Role` headers. This is an interim handoff while the team decides the final service authentication contract. The upstream receives the same path and query string. The gateway does not implement sign-in, registration, OTP, profile or location authorization.

Route definitions live under `src/routing/`, one list per service. `src/app.ts` matches a route, checks whether it is public or authenticated, and proxies it to the configured service origin. Service-level role checks remain in the services. `src/server.ts` only loads configuration and starts listening.

Every completed request has a JSON log with request ID, method, path, target service, status and duration. The gateway forwards a valid incoming `X-Request-Id`, or creates one, and returns it in the response. Authentication and upstream failures have separate JSON events. A missing or invalid token returns 401; JWKS failure returns 503; an unavailable upstream returns 502; an unexpected gateway error returns 500.

Copy `api-gateway/.env.example` to `api-gateway/.env`, set the service URLs, then run `npm install` and `npm run dev` from `api-gateway/`. The gateway loads only its own `.env`, regardless of its working directory; it never reads the repo-root or another service's `.env`. Shell variables take precedence, and a missing `.env` is allowed when the environment supplies the required URLs. Local defaults are User Service 3001, Supplier Service 3002, and gateway 3003. Use `npm test` and `npm run build` to verify. `GET /health` reports gateway process health only. If an upstream is absent, proxy requests return 502.

From the repository root, copy `.env.example` to `.env`, fill in the required settings, and run `docker compose up --build`. The gateway is available at `http://localhost:3003` and uses the User and Supplier container hostnames inside the Compose network. It can also start by itself with `docker compose -f api-gateway/compose.yaml up --build`; upstream requests then need the corresponding service containers in the same `foc` project.

Before connecting the frontend, confirm paths and payloads with User and Supplier owners. Confirm User Service's JWKS path, signing algorithm, issuer and audience. Decide whether each service re-verifies tokens or accepts gateway identity as recorded in the root `AGENTS.md`; this gateway currently forwards the bearer token and creates no identity headers.
