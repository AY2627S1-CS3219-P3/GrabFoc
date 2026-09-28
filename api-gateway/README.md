<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Documented gateway setup, Supplier routes, and current integration boundaries; listed implemented Supplier routes on 2026-09-28.
Author review: Pending gateway owner review.
-->

# API Gateway

_Origin: AI doc; implementation of the gateway direction recorded in the project `AGENTS.md`._

The gateway forwards public `POST /auth/*` requests to User Service. Supplier routing is limited to `GET /location-types`, `GET` and `POST /locations`, `GET` and `PATCH /locations/:locationId`, and `POST /locations/:locationId/deactivate` or `/restore`. Each Supplier route requires a valid User Service bearer JWT. The auth and locations prefixes are configurable. The upstream receives the same path and query string. The gateway does not implement sign-in, registration, OTP or location authorization.

Copy the gateway variables from the root `.env.example`, set service origins, then run `npm install`, `npm run dev`. Local defaults are User Service 3001, Supplier Service 3002, and gateway 3003. Use `npm test` and `npm run build` to verify. `GET /health` reports gateway process health only. If an upstream is absent, proxy requests return 502.

Before connecting the frontend, confirm paths and payloads with User and Supplier owners. Confirm User Service's JWKS path, signing algorithm, issuer and audience. Decide whether each service re-verifies tokens or accepts gateway identity as recorded in the root `AGENTS.md`; this gateway currently forwards the bearer token and creates no identity headers.
