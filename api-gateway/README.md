<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Documented gateway setup and contracts; Codex GPT-6 documented stock Envoy, per-service routes, environment interpolation and Postman testing on 2026-10-13.
Author review: Jie Yang reviewed earlier documentation; Envoy implementation approved, new documentation review pending.
-->

# API Gateway

The Compose stack runs official Envoy v1.38.6, with its built-in JWT verification.
`docker compose up -d --build --no-deps api-gateway` builds a small configuration image;
no native compilation or custom registry release is required.
See [build and tests](envoy/README.md) and [behaviour differences](envoy/behaviour-differences.md).
Import the [gateway Postman collection](postman/gateway.postman_collection.json)
to test User and Supplier routes through port 3003; see [Postman instructions](postman/README.md).
The Node implementation remains a reference; `npm run dev` starts that reference.

_Origin: AI doc; implementation of the gateway direction recorded in the project `AGENTS.md`._

The gateway routes only implemented User Service methods and paths. Public routes are `POST /auth/register`, `/auth/register/verify`, `/auth/register/resend-otp`, `/auth/login`, `/auth/refresh`, `/auth/password/forgot`, `/auth/password/reset`, and `GET /.well-known/jwks.json`. Protected User routes are `POST /auth/logout`; `GET` and `PATCH /users/me`; `POST /users/me/otp`, `/users/me/email`, `/users/me/email/verify`, `/users/me/password`, and `/users/me/deactivate`; `PATCH /users/me/mobile`; `GET /admin/users`; `PATCH /admin/users/:userId/role`; and `POST /admin/users/:userId/reactivate`. The `/auth` prefix is configurable. Unknown methods and paths, including `/internal/**`, return 404.

Supplier routes are `GET /location-types`, `GET` and `POST /locations`, `GET` and `PATCH /locations/:locationId`, and `POST /locations/:locationId/deactivate` or `/restore`. All require a valid User Service bearer JWT. The `/locations` prefix is configurable.

The gateway currently verifies a User Service bearer JWT for protected requests and forwards the bearer token unchanged. It strips caller-supplied `X-User-Id` and `X-User-Role` headers. This is an interim handoff while the team decides the final service authentication contract. The upstream receives the same path and query string. The gateway does not implement sign-in, registration, OTP, profile or location authorization.

The running Envoy gateway loads route definitions from `envoy/routes/*.routes.json`,
one file per service. `envoy/render.py` generates the upstream clusters and route
configuration from those files at startup. See [route-file instructions](envoy/README.md#route-files).
Service-level role checks remain in the services. `src/routing/`, `src/app.ts` and
`src/server.ts` belong to the retained Node reference implementation.

Every completed request has a JSON log with request ID, method, path, target service, status and duration. Envoy applies its default context-sensitive request-ID handling and returns the resulting ID in the response. Authentication and upstream failures have separate JSON events. Stock Envoy authentication failures return text responses (audience mismatch is 403); a JWKS fetch failure is 401 and an upstream connection failure is 503. See the behaviour-differences document for the full comparison.

Copy `api-gateway/.env.example` to `api-gateway/.env`, set the service URLs, then run `npm install` and `npm run dev` from `api-gateway/`. The gateway loads only its own `.env`, regardless of its working directory; it never reads the repo-root or another service's `.env`. Shell variables take precedence, and a missing `.env` is allowed when the environment supplies the required URLs. Local defaults are User Service 3001, Supplier Service 3002, and gateway 3003. Use `npm test` and `npm run build` to verify. `GET /health` reports gateway process health only. If an upstream is absent, proxy requests return 502.

From the repository root, copy `.env.example` to `.env`, fill in the required settings,
run `docker compose up --build`. The gateway
is available at `http://localhost:3003` and uses the User and Supplier container hostnames
inside the Compose network. It can also start by itself with
`docker compose -f api-gateway/compose.yaml up --build`;
upstream requests then need the corresponding service containers in the same `foc` project.

Compose reads optional `api-gateway/.env` settings through `${VARIABLE:-default}`
interpolation. When the root Compose file includes the gateway, root project/shell
variables can override the service file's defaults. Gateway URLs default to the
Compose names `http://user-service:3001` and `http://supplier-service:3002`.
Inside a container, `localhost` refers to that container; use the service names
for container upstreams. For the Node reference running on your host, set those
URLs to `http://localhost:3001` and `http://localhost:3002` instead.
An empty `USER_SERVICE_JWKS_URL` derives the key endpoint from `USER_SERVICE_URL`.
The container listener stays at port 3003. After changing `.env`, recreate the
gateway with `docker compose up -d --no-deps api-gateway` (no image rebuild needed).

Upstream clusters use `STRICT_DNS` discovery and `ROUND_ROBIN` load balancing.
With a single resolved endpoint, all requests go there. With multiple DNS-resolved
endpoints, Envoy distributes requests among them. The isolated integration test
also verifies two explicit Supplier endpoints using `FOC_TEST_SUPPLIER_URLS`;
leave that test override empty in ordinary use. These settings do not create
replicas or enable application health checks automatically.

Before connecting the frontend, confirm paths and payloads with User and Supplier owners. Confirm User Service's JWKS path, signing algorithm, issuer and audience. Decide whether each service re-verifies tokens or accepts gateway identity as recorded in the root `AGENTS.md`; this gateway currently forwards the bearer token and creates no identity headers.
