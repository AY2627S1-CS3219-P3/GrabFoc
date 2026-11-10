<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Document the Envoy runtime, per-service routes, standard Dockerfile and user-approved removal of the legacy Node gateway. Includes the approved JWKS 503 exception.
Author review: Jie Yang reviewed earlier notes; Envoy approach approved by the user, new documentation review pending.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the Credit balance and history routes to the routing rule (#61), as approved by Jie Yang.
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-06
Scope: Added the admin dashboard's User and Order read routes to the routing rule (#182).
Author review: Reviewed by Zi Yi, 2026-11-07; pending approval by Jie Yang (gateway owner).
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: Noted the new GET /orders/:orderId/history route in the routing rule (#184 review).
Author review: Reviewed by Zi Yi, 2026-11-07; pending Jie Yang's approval.
Tool: Claude Code (model: Claude Opus 5.5), dates: 2026-11-08 to 2026-11-09
Scope: Added the chat routes to the routing rule and the [Decided] public chat socket route exception (the chat plan); filled in Jie Yang's verbal confirmation (2026-11-09) as Deanson reported it.
Author review: Reviewed by Deanson, 2026-11-09.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Added the Logging Service's one read route to the routing rule (#52).
Author review: pending - Jie Yang owns the gateway's route files.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Review: that route is a fixed path, not a configurable prefix, and why; and the renderer
refuses two routes of different services that can match one request.
Author review: pending - Jie Yang owns the gateway's route files.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-10
Scope: Review: the collision rule is overlap rather than equality, with the segment grammar it
rests on and the /gateway reservation.
Author review: pending - Jie Yang owns the gateway's route files.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-10
Scope: Review: the renderer's own health routes are in the comparison, and the 404 is not.
Author review: pending - Jie Yang owns the gateway's route files.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-10
Scope: Review: a dot in a regex has to be escaped, because RE2 reads a bare one as any character.
Author review: pending - Jie Yang owns the gateway's route files.
-->

# API Gateway agent notes

_Origin: AI doc; implements the project-wide gateway direction in `../AGENTS.md`._

- The gateway is the frontend's entry point and verifies bearer access tokens against User Service JWKS for protected routes.
- User Service owns registration and sign-in. Supplier Service owns location data and authorization. Do not add business logic or persistent data here.
- Route only the implemented User, Supplier and Order methods and paths, plus Credit's two read routes (`GET /credits/:userId` and `GET /credits/:userId/transactions`, approved by Jie Yang on 2026-10-22). The `/auth`, `/locations`, `/orders` and `/credits` prefixes remain configurable; keep upstream paths unchanged. The Order routes (`30-order.routes.json`) were approved by Jie Yang on 2026-10-22 and cover only what the frontend uses (`GET /orders/:orderId/history`, for a cancelled order's reason, was added on 2026-11-07 and awaits his approval). The admin dashboard (#182, `../docs/admin-dashboard-plan.md` §7) adds `GET /admin/users/login-summary`, `GET /admin/users/:userId/login-events`, `GET /admin/orders`, `GET /admin/orders/overview` and `GET /admin/orders/:orderId/history`, all JWT-protected; the services enforce the ADMIN role. Chat (`50-chat.routes.json`) routes `GET /socket.io/` to the chat service, and Order adds `POST /orders/:orderId/chat-ticket` (JWT-protected). Logging (`50-logging.routes.json`) routes one JWT-protected read to the log store, `GET /logs` on a **fixed** path with no prefix variable (#52); the Logging Service enforces the ADMIN role itself, and its ingest is a Kafka topic rather than an HTTP API, so it has no other route here. Do not give it a prefix: a declared prefix renames only what Envoy matches and is not rewritten on the way out, so moving it sends a path the service does not serve and every request 404s (the same is true of the four prefixes above - changing one needs that service to serve the new path). The renderer refuses to start when **two routes of different services can match one request** - not only when their matchers are equal - because Envoy answers with whichever matched first and that is filename order. Matchers are compared as `/`-separated segment lists, each segment a literal or the whole wildcard `[^/]+`, which covers exact-versus-exact, exact-versus-regex and regex-versus-regex alike; a `regex` outside that grammar is refused, because the comparison would otherwise have a blind spot. In a `regex`, a dot has to be written `\.`: RE2 reads a bare `.` as any character, and modelling it as a literal would make the comparison say two routes are distinct when they are not. In an exact `path` a dot is just a dot. An overlap *inside* one service is allowed and deliberate: Order declares `GET /orders/available` beside `GET {orders}/[^/]+`, the exact one first, and both reach Order. `/gateway` is reserved: every route is also rendered under it, so a prefix reaching in there is taken by whichever service got there first. The renderer's own `GET /health` and `GET /gateway/health` are in the comparison too, so a prefix cannot be shadowed by them; the final 404 is not, because it is a `/` prefix match meant to catch everything the routes above did not. Never route Order's `/internal/**`, Credit's `/internal/credits/**` or `/admin/credits/**`, or Logging's `/internal/**`.
- **[Decided] exception: the chat socket route is public** (no JWT check). A browser can't send `Authorization` on a WebSocket, and the access cookie never reaches services. The chat service refuses every connection without a valid 10-second ticket that Order signs after checking the JWT and the user's participation. It is the only route with `"websocket": true`, which keeps the `upgrade` / `connection` headers (in `compatibility.lua`) and gives it a 60-second idle timeout (Socket.IO pings every 25 s); every other route still strips them and keeps the 10-second default. Agreed by Jie Yang (gateway owner) in the chat plan and confirmed verbally on 2026-11-09; recorded by Deanson on 2026-11-09.
- Compose packages the official Envoy v1.38.6 image with `Dockerfile`. `envoy/render.py` renders routes and startup configuration. The user accepted stock JWT/error/request-ID behaviour on 2026-10-13; differences are in `envoy/behaviour-differences.md`. The gateway checks public versus authenticated access, not service roles.
- User-approved exception: confirmed JWKS fetch/parse failures and empty/unusable key sets return 503, using verifier metadata in the Lua response filter. Invalid tokens and unknown key IDs retain authentication errors. Regression-test failure codes against the pinned Envoy image when upgrading.
- Envoy service routes live in `envoy/routes/*.routes.json`, loaded in filename order. Declare the service name, its URL environment variable and explicit methods/paths there; JWT is required unless `public` is explicitly true. Add approved service routes through these files rather than hard-coding them in the renderer. See `envoy/README.md` for prefixes and tests.
- The user requested removal of the legacy Node gateway on 2026-10-13 after Envoy integration checks passed. Envoy is the only gateway implementation. Integration tests use Node built-ins as fixtures, not as a gateway runtime; no npm dependencies or TypeScript build are needed.
- Normal Compose builds use the official precompiled binary. There are no native patches, Bazel builds, helper service or custom-image release workflow.
- Gateway configuration loads `api-gateway/.env` when present; existing process environment variables take precedence. Do not read another service's `.env`.
- Do not log credentials, tokens or personal data. Log 401/403 attempts in structured form without sensitive values.
- The project has not settled whether each service re-verifies JWTs or trusts gateway identity headers. This gateway forwards the bearer token and does not create identity headers.

Before gateway changes, read the project `AGENTS.md` and the plan in `../docs/frontend-gateway-implementation-plan.md`.
