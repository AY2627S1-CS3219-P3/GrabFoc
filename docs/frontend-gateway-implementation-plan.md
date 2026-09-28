<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Drafted the frontend and API Gateway implementation sequence; updated progress and the JWT handoff decision on 2026-09-28.
Author review: User authorized part 1 and directed the gateway to forward JWTs; service contracts remain for team review.
-->

# Frontend and API Gateway implementation plan

_Origin: AI doc. The user authorized part 1 on 2026-09-27 after the architecture and interface warning._

## Goal and boundaries

The frontend sends requests through the API Gateway. User Service owns registration, sign-in, OTP and user data. Supplier Service owns locations and their management. The gateway verifies JWTs on protected requests and forwards the bearer token unchanged. Each service verifies the token before using its identity claims, then authorizes the requested action. No service data is stored in the gateway.

## Progress as of 2026-09-28

| Area | Status |
|---|---|
| Gateway scaffold, health route, routing, JWT/JWKS verification, and identity-header stripping | Implemented in the working tree; eight gateway tests pass. Live User and Supplier integration is pending. |
| Authentication UI | Sign-in, sign-up and six-digit verification screens exist. Sign-up and OTP resend call the gateway. Sign-in, verification, refresh, logout and session handling are pending. |
| Location and profile UI | Routes exist with unconnected states; live service data and management actions are pending. |
| End-to-end integration | Pending service contracts, Supplier JWT verification, and a browser-to-live-services test. |

## Part 1 — API Gateway (authorized)

Files: `api-gateway/AGENTS.md`, `api-gateway/README.md`, `api-gateway/package.json`, `api-gateway/tsconfig.json`, `api-gateway/src/server.ts`, `api-gateway/src/config.ts`, `api-gateway/src/auth.ts`, `api-gateway/src/proxy.ts`, `.env.example`.

1. Scaffold a TypeScript Node service, health check, configuration and Dockerfile.
2. Forward POST requests under a configurable public authentication prefix to User Service and a configurable protected location prefix to Supplier Service. Preserve the suffix, method, query, body and upstream status.
3. Verify bearer access tokens against User Service JWKS on protected routes. Reject missing or invalid tokens at the gateway. Forward the verified bearer token so the service can apply its own authorization policy.
4. Test gateway health, public and protected routing, invalid tokens, upstream errors, and build.

The public and protected prefixes are temporary gateway routing configuration, **not a claim about the User or Supplier endpoint contracts**. The User and Supplier owners must confirm final paths. The gateway currently supports RS256 and ES256 public-key verification through JWKS; the User Service's actual signing contract, issuer, audience and JWKS path still need confirmation. The user decided that the gateway should forward the JWT to services; each service must verify it before using its claims.

## Part 2 — authentication screens (partial)

Files: `frontend/app/components/auth-screen.tsx`, related frontend API utilities and route files, and frontend documentation. Connect the remaining sign-in and verification actions to confirmed User Service paths through the gateway. Add pending, success and error states. Test with User Service responses and frontend lint/build.

**Design input needed:** User Service paths; strict request and response shapes; OTP length and flow; token transport and refresh behavior.

### Contract check, 2026-09-27

_Origin: Restated from the User Service PR #20 and Supplier Service PR #7; pending merge and owner confirmation for integration._

- User Service exposes `POST /auth/register`, `/auth/register/verify`, `/auth/register/resend-otp`, `/auth/login`, `/auth/refresh`, and `/auth/logout`. Registration verification uses a six-digit OTP and returns tokens. Profile endpoints are still pending in the inspected User Service PR.
- Supplier Service exposes protected `/locations/**` and `/location-types`. Its current development guard trusts `X-User-Id` and `X-User-Role`; the team's User Service integration notes say every service should verify JWTs itself and never trust client identity headers.
- The gateway strips caller-supplied `X-User-Id` and `X-User-Role` headers and forwards the JWT. Supplier's development guard must be replaced with JWT verification before protected browser integration.

**Remaining implementation sequence:**

1. Gateway: confirm the User and Supplier paths and User Service JWT/JWKS contract with their owners; restrict public routing to the confirmed endpoints. Identity-header stripping, its regression test, and the same-origin Next.js rewrite are implemented.
2. Frontend: connect verification, sign-in, refresh, and logout after the team chooses token storage and refresh handling; handle loading, validation and service errors. Sign-up and OTP resend are already connected through the gateway.
3. Supplier Service owner: replace the development header guard with JWT verification, then connect live location browsing and management UI through the gateway.
4. Test browser → gateway → User/Supplier, including invalid token, USER 403 on admin actions, and rejection of forged identity headers.

**Files expected for remaining work:** gateway routing and tests if confirmed contracts require changes; frontend API/session utilities and authentication UI; location UI and Supplier guard files after service-owner coordination; environment examples and documentation.

**Team decisions still needed:** frontend token storage and refresh method; confirmation of the current Next.js rewrite as the final browser-to-gateway route; Supplier owner confirmation of the JWT verification change. These are security and interface design choices under the course AI policy.

## Part 3 — location pages (partial)

The location and profile routes exist with unconnected states. Add frontend API utilities and show live location data to USER and ADMIN; provide ADMIN management controls according to the confirmed Supplier contract. Test browse, filters, pagination, management permissions and mobile layout.

**Design input needed:** Supplier Service paths, list/filter/sort/pagination shape, location fields, status changes and error responses; frontend component library choice.

## Integration (later)

Add the services to `compose.yaml` when their runnable implementations exist. Verify browser → gateway → User/Supplier end to end, including 401 and 403 cases. Update README and AI attribution for every affected file.
