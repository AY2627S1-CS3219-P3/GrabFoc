<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Moved Jie Yang's section out of ai/usage-log.md into this file (issue #65); entry text unchanged except one invalid dash byte fixed to a UTF-8 em dash.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
-->

# AI Usage Log — Jie Yang

Jie Yang's entries for the FoC AI usage log. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). Add entries to this file only, newest first.

### 2026-09-29 23:41 SGT — Fix frontend origin check in Docker

**Tool:** Codex (GPT-6) · **Mode:** debug
**Files:** `frontend/lib/session-server.ts`, `ai/usage-log.md`

**Scenario:** Same-origin POST and PATCH requests from `http://localhost:3000` were rejected before reaching the gateway because Next.js exposed an internal container origin in `request.nextUrl.origin`.

**Prompt (exact):**

~~~text
fix the origin name mismatch
~~~

**What it produced:** Compared the browser Origin with the request Host and protocol, and reused that check for cookie reads carrying an Origin header. Missing and mismatched origins remain rejected.
**What I changed or rejected:** Pending Jie Yang's review; did not disable the origin guard or accept arbitrary forwarded hosts.
**Verification:** Docker frontend rebuilt; same-origin deactivate POST returned 401 without a session instead of an origin 403; forged and missing origins returned 403; login POST reached input validation; frontend route tests passed 34/34.

### 2026-09-29 23:23 SGT — Add gateway and frontend to root Compose

**Tool:** Codex (GPT-6) · **Mode:** generate
**Files:** `compose.yaml`, `api-gateway/compose.yaml`, `api-gateway/.dockerignore`, `api-gateway/README.md`, `frontend/Dockerfile`, `frontend/compose.yaml`, `frontend/.dockerignore`, `frontend/README.md`, `ai/usage-log.md`

**Scenario:** Make the root Compose stack include the existing gateway and frontend alongside User and Supplier.

**Prompts (exact):**

~~~text
the root compose should include the frontend and gateway compose
~~~

~~~text
yes
~~~

**What it produced:** Added per-service Compose files, a frontend production Dockerfile, context exclusions, root includes, and setup notes.
**What I changed or rejected:** Pending Jie Yang's review; the frontend gateway URL is set to the gateway's Compose hostname for both build and runtime.
**Verification:** Root and individual Compose configs passed; both images built; gateway `/health`, frontend `/signin`, and the frontend `/api/gateway/health` rewrite returned 200. Stopped the test containers afterward.

### 2026-09-29 23:07 SGT — Resolve PR #43 merge conflicts

**Tool:** Codex (GPT-6) · **Mode:** debug
**Files:** `ai/usage-log.md`, `supplier-service/compose.yaml`; other merged files came from existing `main` commits.

**Scenario:** Reconcile the Supplier integration branch with the latest `main` for PR #43.

**Prompt (exact):**

~~~text
ok can we resolve the conflicts
~~~

**What it produced:** Kept `main`'s Supplier Compose configuration and Jian Bing's updated log section while preserving the frontend and gateway history on this branch.
**What I changed or rejected:** Pending Jie Yang's review; did not add new architecture or service contracts.
**Verification:** Checked for remaining conflict markers and ran the affected project checks.

### 2026-09-29 22:59 SGT — Remove obsolete frontend locations route

**Tool:** Codex (GPT-6) · **Mode:** refactor
**Files:** `frontend/app/locations/page.tsx`, `frontend/README.md`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`

**Scenario:** Remove the old `/locations` redirect because location browsing now lives at `/home`.

**Prompt (exact):**

~~~text
can we remove the locations page?
~~~

**What it produced:** Deleted the redirect page and removed its documentation and browser-test references.
**What I changed or rejected:** Pending Jie Yang's review; Supplier API `/locations` and admin `/admin/locations` remain in use.
**Verification:** Checked route references and the frontend build.

### 2026-09-29 13:07 SGT — Merge main into frontend User Service integration

**Tool:** Codex (GPT-6) · **Mode:** refactor, explain
**Files:** `ai/usage-log.md`; other files came from the existing `main` commits without AI edits during this merge.

**Scenario:** Merge the latest main branch, which includes the User Service implementation, into the frontend User Service integration branch and preserve both sides of the shared usage log.

**Prompt (exact):**

~~~text
pull main into this branch, it should contain the user service implementation
~~~

**What it produced:** Merged `origin/main`; combined the User Service team's entries and the CodeQL entry from main with the frontend and gateway entries from this branch.
**What I changed or rejected:** Pending human review. No service code was changed while resolving the log conflict.
**Verification:** Checked for conflict markers, confirmed both teams' entries and the User Service files, and recorded the merge status in the handoff.

### 2026-09-29 12:58 SGT — Refresh-only logout revocation

**Tool:** Codex (GPT-6) · **Mode:** generate, debug
**Files:** `frontend/app/api/session/logout/route.ts`, `frontend/lib/protected-gateway.ts`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`

**Scenario:** Revoke a User Service refresh session at logout after the shorter-lived access cookie has expired, while always clearing browser cookies.

**Prompt (exact):**

~~~text
Use the refresh token once to obtain a new access token and **rotated** refresh token, then send both required credentials to User Service’s logout endpoint. The browser cookies should still be cleared if either call fails.
~~~

**What it produced:** Exposed the existing in-flight refresh coordinator to logout, used the rotated access and refresh tokens for remote logout when no access cookie remains, and added success and remote-failure regression cases.
**What I changed or rejected:** Pending human review. Kept the existing direct logout path when the access cookie is present, and kept local clearing on every outcome.
**Verification:** `npm.cmd run test:routes` passed (19/19), `npm.cmd run lint` passed, and `npm.cmd run build` passed. Live User Service verification remains pending.

### 2026-09-29 12:52 SGT — PR #24 rejected-login logging

**Tool:** Codex (GPT-6) · **Mode:** debug, explain
**Files:** `frontend/app/api/session/login/route.ts`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`

**Scenario:** Address the review finding that User Service login 401/403 responses lacked a structured denial event, and explain the separate expired-access logout finding without changing logout.

**Prompt (exact):**

~~~text
update the logging issue and

"The access cookie expires before the refresh cookie. In that state this branch clears local cookies without calling User Service, leaving the refresh session usable. Recover a short-lived access token through the existing refresh path, attempt logout with the rotated refresh token, and still clear local cookies if either call   explain this?
~~~

**What it produced:** Logged upstream login 401/403 using the existing structured helper, without credentials, and added a route regression test. Explained the token lifetimes and remote revocation gap separately.
**What I changed or rejected:** Pending human review. No logout behavior was changed.
**Verification:** Frontend route tests and lint recorded in the handoff.

### 2026-09-29 10:54 SGT — PR #24 token and security review fixes

**Tool:** Codex (GPT-6) · **Mode:** generate, debug, refactor
**Files:** `frontend/lib/{protected-gateway,session-server}.ts`, `frontend/app/api/session/{login,verify,refresh,logout}/route.ts`, `frontend/app/profile/page.tsx`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`

**Scenario:** Investigate PR #24 review comments, implement the approved security plan in the working tree, run checks and a read-only review agent. No commit was requested.

**Prompts (exact):**

~~~text
investigate the current PR and resolve its comments on the token and security

the rotated credentials shouldnt exist any longer than it is used, 403 can be used to differentiate between authenticated but not authorised. a request that presents the old token *after* rotation completes should be rejected.

PLEASE IMPLEMENT THIS PLAN:
# Resolve PR #24 token and security comments

## Summary

Keep rotated credentials only while a refresh is in flight. Once it settles, remove the coordination entry; any later request using the consumed refresh token must reach User Service and be rejected. Keep 403 distinct from 401: it means an authenticated request was denied authorization.

## Implementation

- Update the frontend’s protected gateway helper to coalesce concurrent in-flight refreshes, delete the entry on settlement, and attach rotated cookies even when the subsequent protected request fails. Preserve the existing behavior that clears the session after a second 401.
- Emit the existing structured `unauthorized_access` log for upstream 403 responses and rejected cross-origin session requests, without logging tokens or personal data. Guard cookie-backed profile and status requests against cross-origin requests before they can trigger refresh.
- Give server-to-gateway calls an explicit 10-second timeout and return the existing unavailable response on timeout. Remove the profile page’s session-check preflight so local logout can clear cookies during an upstream outage.
- Update AI disclosures and `ai/usage-log.md` as required by `AGENTS.md`. No public endpoint or response shape changes are planned.

## Verification

- Extend route tests to cover concurrent refresh sharing, rejection of a consumed token after rotation, retained cookies when a protected retry fails, 403 logging, cross-origin rejection before refresh, gateway timeout, and logout during an outage.
- Run frontend route tests, lint, and build. Review each PR thread against the resulting diff before marking it resolved.

## Assumptions

- The confirmed rule is that completed refresh results are never replayed, even to a request carrying a stale cookie.
- A 403 remains a 403 to the caller and is recorded as an authorization denial; it does not trigger refresh or clear cookies.
- The timeout is 10 seconds for all frontend server-to-gateway calls.

do not commit the changes run a [$review-agent](C:\Users\njyang\\.codex\skills\\.system\review-agent\SKILL.md)
~~~

**What it produced:** Removed the completed refresh replay window, kept rotated cookies after a failed retry, added structured 403/origin logs and a 10-second gateway timeout, guarded cookie-backed reads, and let profile logout reach local cookie clearing during outages. Added regression tests and ran a read-only review agent.
**What I changed or rejected:** Pending human review. The read-only review agent reported no findings; its suggested GET Origin-header test was added.
**Verification:** `npm.cmd run test:routes` passed (17/17), `npm.cmd run lint` passed, `npm.cmd run build` passed, and the read-only review agent reported no findings. Live User Service verification remains pending.

### 2026-09-28 — BFF protected-request refresh (feature/frontend-user-service-integration)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug
**Files:** `frontend/lib/protected-gateway.ts`, `frontend/lib/session-client.ts`, `frontend/app/api/session/{profile,status,refresh}/route.ts`, `frontend/test/routes.test.mjs`, `frontend/README.md`, `ai/usage-log.md`

**Scenario:** Implement the approved plan to move protected-request refresh and single-use token coordination into Next.js. User Service and gateway contracts were inspected but not changed.

**Prompt (exact):**

~~~text
PLEASE IMPLEMENT THIS PLAN:
# Move protected-request refresh into the Next.js BFF

## Current request flow

The frontend uses the Next.js App Router and Next.js 16.3.5. The User Service implementation is available on `origin/feature/user-service-admin-reactivate`; its source is not present on the current branch.

```text
Sign-in:
Browser form → Next.js /api/session/login → Gateway /auth/login
             → User Service → token pair
Next.js stores both tokens in HttpOnly cookies → browser receives { ok: true }

Protected profile request:
Browser → Next.js /api/session/status → Gateway /users/me
Browser → Next.js /api/session/profile → Gateway /users/me
Gateway verifies the access JWT using cached JWKS → forwards bearer token

Expired or absent access cookie:
Browser session-client.ts → /api/session/status → 428
Browser, coordinated by Web Locks → /api/session/refresh
Next.js → Gateway /auth/refresh → User Service rotates refresh token
Next.js replaces both cookies → browser retries its intended request

Logout:
Browser → Next.js /api/session/logout → Gateway /auth/logout
Next.js clears both cookies even if remote logout fails
```

## What matches, and what needs changing

- [Session handlers](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/frontend/lib/session-server.ts) keep tokens in HttpOnly, SameSite=Lax cookies. Login and verification responses do not include token values. The `sessionStorage` uses found are for email and a logout notice, not tokens.
- [Gateway verification](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/api-gateway/src/auth.ts) checks signature, `exp`, and `nbf`, plus issuer and audience when configured. It caches JWKS for 60 seconds; it does not call User Service for each protected request. [The proxy](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/api-gateway/src/proxy.ts) forwards `Authorization`. Invalid tokens produce 401; unavailable JWKS produces 503.
- The User Service signs RS256 access tokens valid for **15 minutes** and rotates **single-use** refresh tokens valid for **90 days**. Reusing a rotated token revokes that user’s refresh sessions. Its JWT currently has `sub`, `role`, `iat`, and `exp`; it does not set `iss` or `aud`. Accordingly, the gateway’s optional issuer and audience settings must remain unset until the User Service contract changes.
- The main gap is ownership of refresh: [the browser wrapper](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/frontend/lib/session-client.ts) checks status and calls refresh. [The profile handler](/C:/Users/njyang/Desktop/Uni/CS3219/GrabFoc/frontend/app/api/session/profile/route.ts) forwards a 401 without refreshing or retrying. Its browser caller can subsequently refresh and retry, but the BFF does not yet provide the requested one-refresh, one-retry behavior.
- Web Locks coordinate the current browser flow across tabs. There is no Next.js process-level coordination for simultaneous server requests. Without Web Locks, the current browser wrapper refuses to refresh. The access cookie expires after 15 minutes, so its absence normally triggers refresh through status rather than through an upstream 401.
- Browser-to-Next.js session mutations already require a matching `Origin`. The public registration and recovery forms use a same-origin gateway rewrite and do not carry the session cookies to the gateway as credentials. Keep CSRF checks on cookie-authenticated Next.js mutation routes; do not add them to Next.js-to-gateway bearer calls. Logout already clears local cookies after remote failure.

## Implementation changes

1. Add a shared **server-only protected gateway request** helper beside `session-server.ts`. It sends the access cookie as a bearer token. On an upstream 401, it attempts `POST /auth/refresh` once, replaces both cookies, and retries the original request once. A second 401 ends that request as unauthenticated. A refresh 401 clears both cookies; a refresh 500/503 returns an unavailable response without retrying. Never place tokens in the response body or logs.
2. Add process-level single-flight coordination keyed by a hash of the presented refresh token. Concurrent requests carrying the same cookie pair await one rotation and receive the resulting cookie pair before retrying. Keep completed rotation results briefly so an already-started request with the old cookie does not submit it again. Do not persist or log raw refresh tokens. Retain Web Locks around browser session mutations and refresh-triggering calls to coordinate tabs; document that process-local coordination alone does not cover multiple Next.js instances.
3. Migrate `/api/session/profile` to that helper. Make `/api/session/status` use the same server-side session recovery path so root and Home navigation can recover without a browser-issued refresh call. Simplify `session-client.ts` to request status or protected data and handle authenticated, unauthenticated, and unavailable responses; remove browser ownership of `/api/session/refresh` once all callers have migrated. Preserve the existing login, verification, and logout contracts.
4. Keep both cookies HttpOnly, SameSite=Lax, Secure on HTTPS, and scoped to `/`. Keep the access cookie lifetime aligned with the User Service’s `expiresIn` and the refresh cookie at 90 days; JWT `exp` and User Service refresh validation remain authoritative. The shared path is needed because status, profile, and logout read these cookies. A narrower refresh-cookie path would require a larger session-routing change.
5. Update the frontend README and AI usage log. Leave the gateway verifier, token forwarding, User Service rotation and RBAC ownership unchanged.

## Tests and acceptance

- Extend browser tests to confirm login sets HttpOnly cookies and no token appears in browser-readable storage or response JSON; a valid access token causes no refresh; an expired or invalid token causes one refresh, both cookies rotate, and the original protected request retries exactly once.
- Cover refresh 401 clearing cookies and redirecting protected pages to `/signin`; refresh 500/503 returning an unavailable state without a loop; a second protected-request 401 stopping after one retry; concurrent requests and two tabs submitting a single-use refresh token only once; and logout clearing cookies after remote failure.
- Retain gateway tests proving expired tokens return 401, valid tokens use local verification and cached JWKS, issuer/audience checks apply only when configured, and bearer authorization reaches downstream services.
- Run frontend route tests, lint, build, and gateway tests. Use the existing mock gateway first, then perform a live User Service check when it is available.

## Assumptions and implementation order

Use one Next.js process for the university demo, with Web Locks for tab coordination and process-local single-flight for concurrent server requests. A multi-instance deployment would need shared coordination or a different session design. Implement the shared BFF request and coordination first, migrate profile and status, simplify the browser wrapper, then run the tests and live check.

**Highest risk:** accidentally submitting a rotated refresh token twice, or allowing an older response to overwrite newer cookies. Preserve explicit tests for both races. The token cookie settings, gateway JWT verification and forwarding, and local-cookie clearing on failed logout already behave as intended.
~~~

**What it produced:** A server-only protected gateway helper, shared process refresh coordination, status/profile migration, browser wrapper simplification, and expanded browser tests.

**What I changed or rejected:** Human review pending. The gateway and User Service were left unchanged. The explicit refresh route remains as a compatible path, but the browser no longer calls it.

**Verification:** `npm run test:routes` passed 11 browser tests, frontend lint/build passed, and `api-gateway/npm test` passed 19 tests. The User Service was unavailable on localhost:3001, so live verification remains pending.

### 2026-09-28 — Frontend User Service integration (feature/frontend-user-service-integration)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug
**Files:** `frontend/app/**`, `frontend/lib/**`, `frontend/test/routes.test.mjs`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/README.md`, `frontend/.env.example`, `frontend/.gitignore`, `.env.example`, `docs/frontend-gateway-implementation-plan.md`, `ai/usage-log.md`

**Scenario:** Implement the approved User-first frontend integration with reviewable PRs. The user selected a Next.js server session with HttpOnly cookies, complete registration and password recovery, and no Supplier Service changes.

**Prompt (exact):**

~~~text
PLEASE IMPLEMENT THIS PLAN:
# Frontend integration with reviewable PRs

## Branch and PR order

1. Create `feature/frontend-user-service-integration` from `feature/frontend-service-integration`. Implement and test the User flows, push the branch, and open a PR into the integration branch. Merge after human review.
2. Create `feature/frontend-supplier-service-integration` from the updated integration branch. Implement and test Home location loading, push it, and open a draft PR into the integration branch. Complete the live test after the Supplier owner updates its guard; then review and merge.

Each PR will include a concise summary, affected routes, the service contract it uses, verification commands and results, remaining limitations, and a link to its AI usage-log entry.

## User integration

- Move Sign In to `/signin`, rename the current locations screen to `/home`, update navigation, and redirect `/locations` to `/home`. The root route checks or refreshes the server-managed session and sends the user to `/home` or `/signin`.
- Complete registration with OTP confirmation; connect sign-in and both password-recovery steps to the existing gateway routes.
- Use Next.js handlers and HttpOnly, SameSite cookies for access and refresh tokens. Handle single-use refresh without concurrent reuse, attach bearer tokens to protected calls, and support logout.
- Fetch `GET /users/me` to populate profile fields. Keep credit and order figures unavailable until those services are integrated.

## Supplier integration

- Load active locations on `/home` through gateway `GET /locations`; connect search, live type filters, and pagination to the Supplier API.
- Do not change Supplier Service or add gateway identity headers. Its current development guard remains a blocker for live requests; document that in the draft PR and require a successful live check before merge.

## Verification

Run relevant browser route tests, frontend lint/build, and gateway tests for each branch. Test User flows against the live User Service when available. Test Supplier UI against mocks first, then verify browser → gateway → Supplier with valid and missing tokens after the Supplier guard is updated. Update documentation and the AI usage log on each branch.
~~~

**Review follow-up:** The user supplied a SoCLaaS review of commit `35ca6ee` as an attachment. It asked to verify cookie flags, refresh handling for HTTP 428, token-response validation, and optional phone formatting. Codex inspected the omitted session modules, added browser assertions for HttpOnly/SameSite cookie attributes, cookie clearing, malformed token responses and concurrent refresh, and adjusted phone formatting.

**Further prompt (exact):** `can you check the codex review comments in the PR`

**Codex PR review response:** Codex checked the five inline comments on PR #24. It added strict Zod validation for login and verification bodies, structured logging for profile requests without an access cookie, and serialized login, verification and logout with refresh. It tested rejection of extra fields and a simultaneous refresh/login race. The later exact prompt was: "failed remote logout should remove the local cookies, explain the other browser choice". The logout handler now clears local cookies even when User Service revocation fails, and Sign In displays that revocation was not confirmed. No-Web-Locks behavior remains under discussion.

**What it produced:** User integration branch with login, OTP verification, password recovery, profile, logout, server session cookies, refresh coordination and browser tests. Supplier work follows after review and merge of this branch.

**What I changed or rejected:** Human review pending. The implementation does not modify User Service or Supplier Service and does not expose returned token values in browser JSON.

**Verification:** `npm run test:routes` passed seven browser tests after the Codex review follow-up; `npm run build` and `npm run lint` passed. Live User Service verification remains pending.

### 2026-09-28 — Gateway-local .env configuration (feature/api-gateway-refactor)

**Tool:** Codex (GPT-6) · **Mode:** refactor, debug
**Files:** `api-gateway/src/config.ts`, `api-gateway/test/config.test.js`, `api-gateway/.env.example`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `.env.example`, `ai/usage-log.md`

**Scenario:** Corrected the initial root `.env` approach so the gateway reads only its own environment file. The root `.env` loading entry was removed.

**Prompt (exact):**

~~~text
shouldnt the gateway read from a .env file for the url of the different services and configs...
undo that and remove it for usage log. each service and api gateway should have it's own env. its a microservice architecture which means they shouldnt share an env
~~~

**What it produced:** Gateway-local `.env` loading, a service-specific example file, precedence tests and updated setup instructions.

**What I changed or rejected:** The user rejected loading the shared root `.env`; this replaces that work. No secret values or new configuration keys were added.

**Verification:** `npm.cmd test` passed, including the new configuration tests.

### 2026-09-28 — Gateway architecture refactor (feature/api-gateway-refactor)

**Tool:** Codex (GPT-6) · **Mode:** refactor, debug
**Files:** `api-gateway/src/**`, `api-gateway/test/**`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `ai/usage-log.md`

**Scenario:** Separate route definitions, authentication, proxying and request logging while preserving the gateway's public routes and service RBAC boundary.

**Prompt (exact, from the attached text):**

~~~text
Refactor the API gateway to make it scalable and maintainable as more backend services are added.

Current gateway structure:

src/
├── auth.ts
├── config.ts
├── proxy.ts
└── server.ts

The current server.ts contains service-specific route matching functions such as userRoute() and supplierRoute(), authentication checks, logging, proxying, health checks, and error handling all in one file.

Please refactor this without changing the existing external API behavior.

Architecture requirements:

1. Keep the API gateway responsible for:
   - routing requests to the correct backend service
   - JWT authentication / token verification
   - access logging
   - health endpoint
   - proxying requests
   - generic gateway-level error handling

2. Do NOT move service-level authorization/RBAC into the gateway.
   - The gateway should only distinguish public vs authenticated routes.
   - Individual backend services remain responsible for checking roles/permissions and returning 403 when appropriate.
   - This matches our project architecture: gateway authenticates, each service authorizes.

3. Replace service-specific routing logic in server.ts with declarative route definitions.

Target structure should be approximately:

src/
├── server.ts
├── app.ts
├── config/
│   └── index.ts
├── auth/
│   ├── verify-token.ts
│   └── auth.middleware.ts
├── routing/
│   ├── router.ts
│   ├── types.ts
│   └── routes/
│       ├── user.routes.ts
│       ├── supplier.routes.ts
│       └── index.ts
├── proxy/
│   └── proxy.ts
├── middleware/
│   ├── request-logger.ts
│   └── error-handler.ts
└── utils/
    └── response.ts

You do not have to follow this structure exactly if a simpler structure is cleaner, but keep concerns separated and avoid unnecessary abstraction.

4. Define a reusable GatewayRoute type, something conceptually like:

type GatewayRoute = {
  method: string;
  pattern: RegExp;
  service: ServiceName;
  auth: 'public' | 'authenticated';
};

5. Each service should expose its own route definitions.

For example:

user.routes.ts
- GET /.well-known/jwks.json -> public
- POST auth/register -> public
- POST auth/register/verify -> public
- POST auth/register/resend-otp -> public
- POST auth/login -> public
- POST auth/refresh -> public
- POST auth/password/forgot -> public
- POST auth/password/reset -> public
- POST auth/logout -> authenticated
- GET /users/me -> authenticated
- PATCH /users/me -> authenticated
- GET /admin/users -> authenticated
- PATCH /admin/users/:userId/role -> authenticated

Use the configured authPrefix rather than hard-coding it where appropriate.

supplier.routes.ts
- GET /location-types
- GET /locations
- POST /locations
- GET /locations/:locationId
- PATCH /locations/:locationId
- POST /locations/:locationId/deactivate
- POST /locations/:locationId/restore

These gateway routes should require authentication according to the current implementation. Do NOT enforce ADMIN role in the gateway; Supplier Service handles that.

6. Implement a generic router:

findRoute(routes, method, path)

It should return the matching route definition instead of server.ts knowing anything about User Service or Supplier Service route shapes.

7. Centralize service URL resolution.

For example:

getServiceUrl(route.service, config)

Avoid scattered conditionals such as:

if user -> config.userServiceUrl
if supplier -> config.supplierServiceUrl

Design it so adding an order service later is straightforward.

8. Extract authentication handling so this duplicated code disappears:

if (!await verify(request.headers.authorization)) {
  console.warn(...)
  return json(response, 401, { error: 'Unauthorized' });
}

Create a reusable authentication helper/middleware.

9. Improve error handling.

Currently one large try/catch can turn any error into:

503 Authentication service unavailable

That is misleading.

Separate at least:

- authentication verifier failure -> 503 Authentication service unavailable
- invalid/missing authentication -> 401 Unauthorized
- unmatched route -> 404 Not found
- upstream/proxy failure -> 502 Upstream service unavailable
- unexpected gateway error -> 500 Internal server error

Be careful not to send a second response if the proxy has already started writing.

10. Improve structured logging.

Keep JSON structured logs.

At minimum log completed requests with:
- event
- requestId
- method
- path
- target service if applicable
- status
- durationMs

Also log authentication failures and upstream failures.

Generate or propagate a request ID:
- use incoming x-request-id if present
- otherwise generate one
- forward it to downstream services if feasible with the existing proxy implementation

11. server.ts should become very small.

Its responsibility should mostly be:
- load config
- create the gateway/app
- start listening
- log gateway_started

Move request-processing logic elsewhere.

12. Preserve dependency injection/testability.

The existing createGateway(config, verify = createTokenVerifier(config)) pattern allows tests to inject a fake token verifier. Preserve this capability or improve it.

13. Preserve existing behavior unless required for the architectural refactor.

Do not:
- rename public API endpoints
- change request/response payloads
- introduce a web framework such as Express/Fastify unless absolutely necessary
- add Kong, Envoy, service mesh, Kubernetes-specific components, etc.
- duplicate RBAC logic from downstream services
- overengineer the gateway

Continue using node:http.

14. Add/update tests.

Cover at least:
- GET /health -> 200
- unknown route -> 404
- public user route works without auth
- protected user route rejects invalid auth with 401
- protected supplier route rejects invalid auth with 401
- valid authenticated route proxies to correct service
- dynamic routes such as /locations/:id match
- /locations/:id/deactivate and /restore match
- /admin/users/:id/role matches
- malformed similar paths do not accidentally match
- verifier exception returns 503
- proxy/upstream failure returns 502 if testable
- route ordering does not cause dynamic routes to shadow more specific routes

15. Check the existing repository before making changes.

Do not assume the pasted snippets represent the entire implementation. Inspect:
- package.json
- tsconfig
- existing tests
- auth.ts
- config.ts
- proxy.ts
- server.ts
- downstream route conventions

Reuse existing utilities where appropriate instead of rewriting working code unnecessarily.

16. Keep TypeScript strict and avoid `any`.

Prefer small explicit types and functions.

17. Important: regex/path matching must be correct.

Examples:
- /admin/users/<id>/role
- /locations/<id>
- /locations/<id>/deactivate
- /locations/<id>/restore

Do not use malformed escaped regexes. Ensure matches are anchored with ^ and $ so extra path segments do not match unintentionally.

Before editing:
1. Inspect the current gateway implementation and tests.
2. Briefly explain the refactor plan.
3. Then implement it.

After editing:
1. Run typecheck.
2. Run gateway tests.
3. Run lint if configured.
4. Fix any failures caused by the refactor.
5. Summarize:
   - files added/changed
   - architectural changes
   - behavior preserved
   - tests run and results
   - any remaining concerns

Keep the solution appropriate for a university microservices project: clean, extensible, testable, but not production-infrastructure overkill.
~~~

**Additional prompt (exact):**

~~~text
maybe you can js branch out from that integration branch into the a api-gateway branch, commit and push those changes there, then merge it back into this frontend-service integration branch
~~~

**What it produced:** Declarative service routes, a generic matcher, a small startup entry point, request IDs and structured logs, distinct 401/502/503/500 handling, and regression tests. A review finding led to a follow-up fix that returns 503 only for JWKS outages and 500 for unexpected verifier errors.

**What I changed or rejected:** Pending gateway owner review. The existing bearer-token handoff remains unchanged.

**Verification:** `npm.cmd test` passed all 19 tests after the review fix; human review remains pending.

### 2026-09-28 — Supplier Service gateway routes (feature/gateway-supplier-routes)

**Tool:** Codex (GPT-6) · **Mode:** generate, explain
**Files:** `api-gateway/src/server.ts`, `api-gateway/test/gateway.test.js`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `ai/usage-log.md`

**Scenario:** Map the Supplier Service routes while leaving the final service authentication handoff undecided.

**Prompts (exact):**

~~~text
can you just route the end points for user branch and supplier branch first before we decide how the authentication is going to be handled
implement the plan to integrate user and supplier service
~~~

**What it produced:** An exact Supplier route map, gateway tests, and gateway documentation. Protected routes continue the existing JWT verification and forwarding behavior.

**What I changed or rejected:** Pending owner review; the authentication handoff remains subject to team confirmation.

**Verification:** Gateway test and build results are recorded with the implementation review.

### 2026-09-28 — User Service gateway routes (feature/gateway-user-routes)

**Tool:** Codex (GPT-6) · **Mode:** generate, explain
**Files:** `api-gateway/src/server.ts`, `api-gateway/test/gateway.test.js`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `ai/usage-log.md`

**Scenario:** Map implemented User Service routes while leaving the final service authentication handoff undecided. PR #22 added self-profile and admin routes to the previously inspected auth branch.

**Prompts (exact):**

~~~text
can you just route the end points for user branch and supplier branch first before we decide how the authentication is going to be handled
can you inspect origin/pr/22
implement the plan to integrate user and supplier service
~~~

**What it produced:** An exact User route map, gateway tests, and gateway documentation. Protected routes continue the existing JWT verification and forwarding behavior.

**What I changed or rejected:** Pending owner review; the route and authentication handoff decisions remain subject to team confirmation.

**Verification:** Gateway test and build results are recorded with the implementation review.

### 2026-09-28 — Reconstruct frontend and gateway AI usage (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** explain, refactor
**Files:** `ai/usage-log.md`

**Scenario:** I asked Codex to reconstruct my entries from this project's local chat transcripts after the log had been removed and restored.

**Prompts (exact):**

~~~text
can you restore the AI usage-log

Ok ONLY from now on, we shall continue on the AI Usage Log, the currently implemented gateway and frontend, can you search our chat history to populate the AI-usage log under Jie Yang

can you search our chat history to populate the AI-usage log under Jie Yang
~~~

**What it produced:** Dated entries below, based on the September 24, 25, 27 and 28 transcripts. The entries distinguish generated code, explanations, team direction and checks reported by Codex. They are provisional work-session entries until the work is assigned to PRs.

**What I changed or rejected:** I restricted the reconstruction to my frontend and gateway work. The other members' sections remain placeholders. My review of these entries is pending.

**Verification:** Codex compared the prompts with local session transcripts and the working-tree files. This log edit does not verify the application itself.

### 2026-09-28 — Gateway identity handoff and plan update (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** explain, refactor
**Files:** `docs/frontend-gateway-implementation-plan.md`; gateway code and tests were inspected, not changed in this exchange.

**Scenario:** I asked about JWT/JWKS, the gateway's authentication role, why caller-supplied identity headers are stripped, and the remaining work. I directed the gateway to forward the JWT to services, then asked Codex to update the plan.

**Prompts (exact, in chronological order):**

~~~text
middleware authorization\
authentication with api gateway

is this enough information to implement the gateway

can you explain further on how JWTK and JWT works first? what are the options i have and the drawbacks etc for each

i still dont understand  this...

so what are the different options meaning?

gateway should handle authentication while the services themselves handle authorization

ok wait what are the current implemented things, can we split them into valid commits and commit it to the branch

dont commit anything yet, jusst explain it first, and get rid of the usage-log.md

whats the proxy n whys it strip the caller supplied user id and role

whats the diff between the 2 options

so it does both now?

the gateway should just forward the JWT to the different services

does the current gateway forward the jwt to the supplier service

how far into this are we

update the plan
~~~

**What it produced:** Codex explained the current gateway behavior and updated the plan to record the JWT handoff, progress and pending contracts. It did not make a commit.

**What I changed or rejected:** I directed the JWT-forwarding approach and stopped the proposed commit. I requested removal of the old log, then later requested its restoration. Service owners still need to confirm their JWT and endpoint contracts.

**Verification:** The plan records eight passing gateway tests from prior work. No live browser-to-service integration was demonstrated in this exchange; my review remains pending.

### 2026-09-27 — Gateway scaffold, frontend routes and partial connection (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug, explain
**Files:** `api-gateway/**`, `frontend/**`, `docs/frontend-gateway-implementation-plan.md`, `.env.example`

**Scenario:** I asked Codex to plan the gateway, implement part 1, add missing frontend pages based on Figma, inspect the Supplier PR, correct two gateway mismatches, and connect token-independent registration actions to the gateway.

**Prompts (exact, in chronological order):**

~~~text
This action is unavailable right now. Please try again later.
whhy, also can you change the name to be GrabFoc instead of campus errand platform?

ok can you create some skills or use the AWWARD and frontend design skills downloaded and architecture for the frontend and API gateway.


I need to create an API gateway for the application. the Sign up and sign in will be given to the user service to handle but will go through the gateway first. The Supplier service will handle the supllier related pages

can you write a .md file of this implementation plan first then implement part 1 first

what are the routes to the other pages

can you create the supplier and user pages too? did you not refer to the figma

most recent PR looks kinda good on postman collection, can start on the gateway stuff&#x20;

this is the supplier service contracts its in the new PR, should i pull it first or can we develop the gateway without this

why cant i click courier view

should i branch out to a feature/frontend branch or should i combine the frontend and api-gateway branches?&#x20;

I was thinking checkout to a frontend-apigateway branch then i pull from the Supplier service branch first

ok can you inspect the Supplier branch?

1. `/location-types` currently returns 404 at the gateway because only `/locations` is routed.
2. The Supplier service defaults to port **3002**, while our example config points it to **3003**.&#x20;

change these 2 first

can you explain how the gateway and frontend work rn..

The gateway also currently passes client-supplied identity headers through   whats this mean and can we connect the gateway to the frontend

cant we implement the other things first before the token related issues.

how can i set up tests to check where each button sends to? I cant check if it sends to the gateway

sign in isnt routed to the api gateway?
~~~

**Additional Figma links supplied in this exchange:**

~~~text
https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-226&p=f&t=zTdyG6lDCXrt5haX-0

[https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-1069&p=f&t=zTdyG6lDCXrt5haX-0](https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-1069\&p=f\&t=zTdyG6lDCXrt5haX-0) user profile page
~~~

**What it produced:** Codex wrote the plan and gateway scaffold with health, public auth proxy, JWT/JWKS verification for protected Supplier routes, tests, configuration and Dockerfile. It added `/locations` and `/profile` frontend shells from the linked frames, made the requester/courier switch clickable, routed `/location-types`, corrected example ports, added a same-origin frontend-to-gateway rewrite, and connected sign-up and OTP resend. It added frontend route tests and changed the verification UI to six digits. Sign-in, code confirmation, session handling and live Supplier data remain pending.

**What I changed or rejected:** I requested the GrabFoc name, two specific gateway corrections, a working courier switch, and token-independent steps first. I asked Codex to inspect the Supplier PR without merging it. Codex flagged the Supplier development guard that trusts client identity headers; that integration remains pending. Final token storage and owner-confirmed service contracts remain pending.

**Verification:** Codex reported passing gateway tests after its changes (six initially, then seven after `/location-types`) and passing frontend lint/build after UI changes. The working-tree plan later records eight gateway tests. These are Codex-reported checks; a live end-to-end test and my own review remain pending.

### 2026-09-24 to 2026-09-25 — Figma authentication frontend and npm verification (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug, explain
**Files:** `frontend/app/**`, `ai/usage-log.md` (initial draft); Figma MCP and skills were installed in local Codex configuration outside the repo.

**Scenario:** I asked Codex to read the D1 document, use the Figma mockup, install frontend skills and Figma MCP, then recreate the authentication frontend before gateway integration.

**Prompts (exact, in chronological order):**

~~~text
C:\Users\njyang\Downloads\cs3219-group3-D1.docx Read this file, i need to create the UI and API gateway for this application. The figma design can be found here. https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=0-1&t=zTdyG6lDCXrt5haX-0 can we install some frontend skills like the AWWWARDS skill and $skill-installer frontend-skill, npx skills add https://github.com/devmartinese/awwwards-animations-skill --skill awwwards-animations run these commands. Then create the neccessary components for the front end for the user service and the supllier service first.

Can you download the figma mcp

https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-122&t=zTdyG6lDCXrt5haX-0 can you refer to this now? and recreate the current front end first?

can you use the figma mcp tools

continue please

why is there a bun runtime error i dont think im using bun for this application right

js run npm instead of bun

uh how do i run dev

'npm' is not recognized as an internal or external command,
operable program or batch file.
~~~

**What it produced:** Codex installed the AWWWARDS skill through the Codex installer after `npx` was unavailable, plus frontend and Figma skills. It configured Figma's remote MCP, inspected the authentication frames, and generated responsive sign-in (`/`), sign-up (`/signup`) and verification (`/verify`) screens. Form submission remained unconnected to User Service. It initially tried Bun for checks, then used a verified portable Node installation to run npm after I objected.

**What I changed or rejected:** I asked to recreate the frontend first, questioned Bun, and directed Codex to use npm. The initial UI used the four-digit Figma mockup; the later User Service contract led to the six-digit change recorded above.

**Verification:** Codex reported `npm ci`, `npm run lint` and `npm run build` passing on September 24, with `/`, `/signup` and `/verify` generated. I still need to review the UI and test it against a live User Service.

## 2026-09-29 05:34 UTC — Non-local HTTP browser notice

- Tool and mode: Codex (GPT-6), debug and generate.
- Usage scenario: Diagnose the frontend session screen on a plain HTTP network address and show a clear unsupported-browser message, following the user's earlier preference for that case.
- Exact user prompts: “the app does not need to support plain http on non-local host, in that scenario a simple "browser not supported" should suffice but its a low priority issue” and “if i run it on [http://100.79.249.10:3000](http://100.79.249.10:3000) it'll keep saying its checking my session”.
- Key response: Reproduced the stuck session screen at the reported address; the session-status request returned 403. Its page also failed to hydrate, so the notice is rendered by the server layout for HTTP on non-local hosts while keeping localhost and HTTPS available.
- Files: `frontend/app/layout.tsx`.
- Human review: Pending.

## 2026-09-29 07:35 UTC — Supplier PR import and frontend integration

- Tool and mode: Codex (GPT-6), generate, debug, explain.
- Usage scenario: Import the Supplier sorting and JWT verification work before integrating the Supplier Service into the gateway and frontend.
- Exact user prompts: “we should be done with integrating the user service now i need to branch out and integrate the supplier service. 1st is the receiving of supplier information and a list of suppliers. then it's the filtering and search, lastly its the difference between admin account priviledges to edit or add suppliers and a normal user who can only view”; “wait there's a PR for the new supplier svs taking in the token”; “I recommend adding that to the existing session check after verification. Supplier Service would still independently verify the JWT and reject unauthorized edits.   what would this look like”; “the session check involves checking with user svs?”; “doesnt the jwt contain the role?”; “wait so whats the current implementation and issue and solution”; “can we not pull pr 28 and 30 into our branch first and continue working”; “continue”.
- Key response: Imported the substantive commits from PRs #28 and #30; added Supplier database and service to root Compose; forwarded cookie-backed requests through allowlisted Next.js routes and the gateway; exposed the verified role in session status; added live location browsing, search, filters, pagination and admin management; added browser route coverage and run instructions.
- Files: `.env.example`, `compose.yaml`, `supplier-service/compose.yaml`, `frontend/app/**`, `frontend/lib/**`, `frontend/test/routes.test.mjs`, `frontend/README.md`, `supplier-service/README.md`, `ai/usage-log.md`.
- Human review: Pending. Tests and live verification are recorded in the working session.

## 2026-09-29 — Sync latest main and PR #28

- Tool and mode: Codex (GPT-6), merge and debug.
- Usage scenario: Update `feature/frontend-supplier-service-integration` while preserving uncommitted Supplier integration work.
- Exact user prompt: “pull from the latest main and PR 28”.
- Key response: Fetched `origin/main` and PR #28, confirmed PR #28 was already merged into main, merged main, kept the reviewed Supplier disclosures and both AI log histories, and restored the uncommitted integration changes.
- Human review: Pending review of the merged branch and integration work.

## 2026-09-29 — Merge Supplier PR #33

- Tool and mode: Codex (GPT-6), merge and debug.
- Usage scenario: Bring the nearby search and Supplier Compose work into the frontend integration branch while preserving uncommitted work.
- Exact user prompt: “pull from PR 33”.
- Key response: Merged PR #33, combined the team's AI log histories, restored the frontend changes, retained the PR's Supplier Compose layout, and required an explicit Supplier database password in `.env`.
- Human review: Pending review of the merged branch and integration work.

## 2026-09-29 — Commit Supplier integration and open PR

- Tool and mode: Codex (GPT-6), verify and Git workflow.
- Usage scenario: Finalize the frontend and gateway Supplier integration work and propose it against the frontend integration branch.
- Exact user prompt: “commit the current changes based on it's changes and open a PR to merge this into frontend service integration branch”.
- Key response: Verified the frontend, committed the local Supplier integration changes, pushed the branch and opened a PR targeting `feature/frontend-service-integration`.
- Human review: Pending PR review.

## 2026-09-29 — Supplier PR #37 follow-up review

- Tool and mode: Codex (GPT-6), debug and refactor.
- Usage scenario: Address newly posted frontend review comments on PR #37 while leaving User Service and Supplier Service components untouched.
- Exact user prompt: “for each PR, 39 and 37, resolve the messages, ensure the changes made do not touch the individual components of the user service and supplier service.”
- Key response: Added Home location-type error and retry state, management list type/building/time/order controls, and refreshed-version edit form reset, with browser regression coverage. Supplier-owned comments were left for the service owner.
- Files: `frontend/app/components/location-browser.tsx`, `frontend/app/admin/locations/page.tsx`, `frontend/app/globals.css`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`.
- Human review: Pending PR review and team decision on the responsive UI library.

## 2026-09-29 — Supplier integration PR #37 frontend review fixes

- Tool and mode: Codex (GPT-6), debug and refactor.
- Usage scenario: Resolve Supplier integration review comments in frontend and gateway-facing code without changing Supplier Service.
- Exact user prompt:

~~~text
PLEASE IMPLEMENT THIS PLAN:
# Resolve frontend comments on Supplier integration PR #37

## Summary

Update PR #37’s branch with fixes limited to frontend and gateway-facing code. Leave all Supplier Service files and their review threads untouched. The confirmed security behavior is: when Supplier returns 401, check the token with User Service before deciding to refresh or clear the browser session.

## Implementation

- **Supplier session route:** On a Supplier 401, check `/users/me` through the gateway using the same access token. If User Service accepts it, keep the cookies and return the existing unavailable response so the page offers Retry. If User Service returns 401, use the existing refresh path; clear cookies only if refresh confirms the session is invalid. If confirmation is unavailable, keep cookies and return unavailable. Apply the same check if Supplier rejects the rotated token, retaining rotated cookies when User Service accepts it.
- **Location management:** Show a distinct error and Retry action when location types fail to load. After a successful create, reset the uncontrolled form. After deactivate or restore, clear the edit form if it holds that location so Save cannot submit its stale version.
- **Verification:** Add route tests for Supplier-only 401, authority-confirmed expiry, failed confirmation, and rotated-cookie retention; add UI tests for location-type retry, consecutive creates, and status change while editing. Run frontend route tests, lint, and build.
- **PR follow-up:** Add required AI disclosures and usage-log entry, commit and push to PR #37, reply to and resolve the four frontend inline threads, then check new reviews for actionable frontend or gateway feedback.

## Boundaries and assumptions

- Do not edit `supplier-service/` or resolve or reply to its four Supplier-owned threads, including the Compose documentation thread, as requested.
- The existing unavailable response is the agreed response when Supplier rejects a token that User Service confirms is valid. No Supplier API contract changes are needed.
- PR #37 remains open; no merge is part of this work.
~~~

- Key response: Added an authority check before reacting to Supplier 401s, retryable location-type loading, form resets after create and status changes, and regression tests. Supplier Service files and threads were left unchanged.
- Files: `frontend/lib/protected-gateway.ts`, `frontend/app/api/session/supplier/[...path]/route.ts`, `frontend/app/admin/locations/page.tsx`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`.
- Human review: Pending PR review.

## 2026-09-29 — Reusable frontend error handling

- Tool and mode: Codex (GPT-6), generate, debug, explain.
- Usage scenario: Add reusable service-error parsing, toast feedback and form field errors on the User integration branch, with a stacked PR workflow.
- Exact user prompts:

~~~text
the user service integration branch can be accessed to work on reading the response to receive the proper errors
can we define proper error handling and error popups on the front end ? update the user service integration branch to the latest  and branch out to handle the errors.

The supplier service should also define the proper errors
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "The request is invalid.",
        "details": {
            "fields": [
                {
                    "field": "email",
                    "message": "must be a valid email address"
                },
                {
                    "field": "email",
                    "message": "must be an NUS address (@u.nus.edu or @nus.edu.sg)"
                }
            ]
        }
    }
}

Once done, create the relevant PRs to merge user error handling to user service integration and back to service integration. The error handling on the front end should be extensible to other future services like order service etc. The other services also have certain fields to fill out and it'll be good if we can have a error handling for user and other services too

PLEASE IMPLEMENT THIS PLAN:
# Reusable frontend error handling

## Summary

Update `feature/frontend-user-service-integration` from the latest `main`, then create `feature/frontend-user-error-handling`. Implement error handling on User Service screens using components and a response parser that Supplier, Order, and future forms can reuse.

## Implementation

- Add a shared parser that normalizes User Service’s `{ error: { code, message, details } }` and Supplier’s current RFC 9457 Problem Details into a frontend error type. Keep parsing separate from service-specific code-to-message rules. Handle malformed responses with safe defaults.
- Add an accessible, dismissible toast for operation failures and reusable inline field errors for validation. Each form supplies its backend-to-frontend field mapping, including `displayName` → Full Name. Keep a visible retry action for failed page loads.
- Apply the system to sign-in, sign-up, OTP verification and resend, password recovery, and profile loading and logout. Handle known User Service codes such as `EMAIL_TAKEN`, `OTP_INVALID`, `OTP_EXPIRED`, `ACCOUNT_LOCKED`, and `RATE_LIMITED`; preserve password recovery’s account-enumeration protection.
- Keep service response shapes unchanged. Supplier backend codes and field-detail extensions need Supplier owner approval, so that contract change belongs in a separate Supplier PR. Supplier screens from PR #37 are outside this round.

## Verification and PRs

- Test validation fields, known error codes, retry details, malformed responses, toast dismissal, page-load retry, and password recovery behavior. Run frontend route tests, lint, and build.
- Open PR 1 from `feature/frontend-user-error-handling` into `feature/frontend-user-service-integration`. After PR 1 is reviewed and merged, open PR 2 from the updated User integration branch into `feature/frontend-service-integration`. Do not merge either PR automatically.
- Record AI assistance and add file disclosures as required by `AGENTS.md`.

## Assumptions

- “Latest” means the remote `main` at implementation time.
- The shared parser supports Supplier’s current response format now; it does not depend on the pending Supplier API decision.
- Only User Service screens adopt the new UI in this round. Future services use the same parser, toast, and field-error components.
~~~

- Key response: Updated the User integration branch from main, created `feature/frontend-user-error-handling`, normalized both existing error envelopes, and added reusable toast and field feedback to the User screens. Supplier Service's response contract remains pending its owner's approval.
- Files: `frontend/lib/service-errors.ts`, `frontend/lib/user-error-copy.ts`, `frontend/app/components/error-feedback.tsx`, User frontend screens, `frontend/app/globals.css`, `frontend/test/routes.test.mjs`, `frontend/README.md`, `ai/usage-log.md`.
- Human review: Pending PR review and manual UI inspection.

## 2026-09-29 — PR #38 review follow-up

- Tool and mode: Codex (GPT-6), debug, refactor.
- Usage scenario: Address review feedback on reusable User Service error handling.
- Exact user prompt: “in the user error handling PR there are unresolved comments, keep resolving the comments and committing, and monitor the new reviews and resolve them”
- Key response: Ensured verification and resend expose validation for fields absent from the form, made profile transport and JSON failures show a safe retry message, kept the toast timer stable across parent renders, and masked unknown backend messages on profile load/logout after a fresh review. Added regression coverage and checked PR #38 again after pushing.
- Files: `frontend/app/components/auth-screen.tsx`, `frontend/app/components/error-feedback.tsx`, `frontend/app/profile/page.tsx`, `frontend/lib/user-error-copy.ts`, `frontend/test/routes.test.mjs`, `ai/usage-log.md`.
- Human review: Pending PR review.

## 2026-09-29 — PR #39 environment template review

- Tool and mode: Codex (GPT-6), documentation fix.
- Usage scenario: Address a project environment-template comment on PR #39 without editing User Service or Supplier Service components.
- Exact user prompt: “for each PR, 39 and 37, resolve the messages, ensure the changes made do not touch the individual components of the user service and supplier service.”
- Key response: Documented `NODE_ENV=production` as a safe example for the existing Supplier development-auth guard. Service code was unchanged.
- Files: `.env.example`, `ai/usage-log.md`.
- Human review: Pending PR review.

## 2026-09-29 — Resolve PR #37 after PR #39 merged

- Tool and mode: Codex (GPT-6), merge and debug.
- Usage scenario: Bring the merged User frontend error-handling work into the Supplier integration PR without changing User Service or Supplier Service components.
- Exact user prompts: “im unable to merge PR37  and 39 there are conflicts, what are these conflicts and how shld we resolve them, there shouldnt be too much conflicts..”; “39 is merged”.
- Key response: Merged the updated frontend integration base into PR #37, retained both AI-log histories, and combined shared frontend disclosures. Verified the combined frontend before pushing.
- Files: `ai/usage-log.md`, `frontend/README.md`, `frontend/app/globals.css`, `frontend/test/routes.test.mjs`.
- Human review: Pending PR review.

## 2026-10-01 — Supplier location thumbnails

- Tool and mode: Codex (GPT-6), generate and explain.
- Usage scenario: Show Supplier location images in the existing frontend without changing the service contract.
- Exact user prompts: “how does the frontend load the images for the supplier service now? theres definitiely a better way of showing it on the UI and also loading it rather than just a pure image right?”; “how does the second lazy load thing work? and how does nextjs image optimization work when the database stores url?”; “so the frontend server will be storing the image somewhere in its cache isit? it will load from the URL and then store it to load on the UI?”; “how will it know to NOT fetch it again?”; “ok branch out to implement this and open a PR”.
- Key response: Added lazy, fixed-ratio card thumbnails using the existing `image_url`; configured Next.js optimization for the seeded template image path, kept other HTTPS URLs direct, and provided a missing/broken-image placeholder. No Supplier API or schema change.
- Files: `frontend/app/components/location-image.tsx`, `frontend/app/components/location-browser.tsx`, `frontend/app/globals.css`, `frontend/next.config.ts`, `frontend/README.md`, `ai/usage-log.md`.
- Human review: Pending PR review and manual image inspection.

## 2026-10-01 — PR #47 image and layout follow-up

- Tool and mode: Codex (GPT-6), debug and refactor.
- Usage scenario: Correct seeded images failing to load and reduce Supplier browsing card and filter size.
- Exact user prompt: “the images show no image available, and each location card is too big right now, the filter selections should all lie in one row instead of a grid”.
- Key response: Removed empty image areas, shortened cards, used four columns at wide widths, and kept filters in a single horizontally scrollable row. The initial local public image copy was replaced after the user clarified Supplier Service ownership.
- Files: `frontend/app/components/location-image.tsx`, `frontend/app/components/location-browser.tsx`, `frontend/app/globals.css`, `frontend/next.config.ts`, `frontend/test/routes.test.mjs`, `frontend/README.md`, `ai/usage-log.md`.
- Human review: Pending PR review and visual inspection.

## 2026-10-01 — Supplier image delivery clarification for PR #47

- Tool and mode: Codex (GPT-6), explain and refactor.
- Usage scenario: Check whether image bytes can come from Supplier Service without modifying that service.
- Exact user prompt: “the images shouldnt be on the frontend public folder. it should fetch from supplier service”.
- Key response: Reverted the proposed Supplier endpoint, gateway route, Dockerfile, and service documentation after the user specified that Supplier Service files must not be touched. The existing Supplier API only returns an image URL; it cannot supply image bytes through its current endpoints. Kept frontend-only layout improvements.
- Files: `frontend/app/components/location-image.tsx`, `frontend/app/components/location-browser.tsx`, `frontend/app/globals.css`, `frontend/next.config.ts`, `frontend/test/routes.test.mjs`, `frontend/README.md`, `ai/usage-log.md`.
- Human review: Pending PR review; image source decision remains open.

## 2026-10-01 — Enable seeded location image optimization

- Tool and mode: Codex (GPT-6), debug and generate.
- Usage scenario: Enable Next.js optimization for location thumbnails using the existing Supplier image URLs.
- Exact user prompts: “why isit when it is unoptimized, the images load successfully, but when i remove it the images dont load”; “is this rlly the best way to handle loading images”; “enable optimization and configure the allowed path”.
- Key response: Removed the component's `unoptimized` prop and allowed HTTPS images only from `raw.githubusercontent.com/CS3219-AY2627S1/FoC-Template/main/data/images/**`, without query strings or custom ports. Retained lazy loading and the error fallback.
- Files: `frontend/next.config.ts`, `frontend/app/components/location-image.tsx`, `ai/usage-log.md`.
- Human review: Pending human review and runtime image inspection.

## 2026-10-01 — Preserve external HTTPS location thumbnails

- Tool and mode: Codex (GPT-6), debug.
- Usage scenario: Fix valid Supplier HTTPS image URLs rejected by the restricted Next.js optimizer path.
- Exact user prompt: “When an admin saves a valid HTTPS URL outside this single GitHub path (the Supplier contract and integration fixtures accept URLs such as https://example.com/canteen.jpg), LocationImage passes it to next/image, but the optimizer rejects it because it does not match remotePatterns, causing the card to show ‘No image available’ even though the full-image link works. This is distinct from the previously reported HTTP-only issue: the newly added restrictive pattern also breaks contract-valid HTTPS hosts, so provide a compatible rendering path or align the service contract. AGENTS.md reference: frontend/AGENTS.md:L18-L22”.
- Key response: Optimize images matching the configured GitHub host, path, port and query restrictions; render other valid HTTPS URLs with unoptimized delivery. Supplier contract is unchanged.
- Files: `frontend/app/components/location-image.tsx`, `ai/usage-log.md`.
- Human review: Pending human review.

## 2026-10-01 — Location thumbnail fallback and stale optimizer build

- Tool and mode: Codex (GPT-6), debug.
- Exact user prompts: `"url" parameter is not allowed`; `the location cards should all have a location image thumbnail and only show it if the url isnt there from the supplier service`.
- Key response: Found the saved Next.js build had no remotePatterns despite the current configuration allowing seeded GitHub images. Rebuilt the frontend. Kept a thumbnail area on every location card, using Supplier image_url when available and the existing placeholder when missing or unavailable.
- Files: `frontend/app/components/location-image.tsx`, `ai/usage-log.md`.
- Human review: Pending human review.

## 2026-10-01 — Avoid server fetches for location thumbnails

- Tool and mode: Codex (GPT-6), debug.
- Usage scenario: Next.js returned 400 while fetching a remote location image URL.
- Exact user prompt: “i get a 400 Bad request response , the next.js server cant access the image URL”.
- Key response: Rendered every valid HTTPS location image directly from its URL with `next/image`'s `unoptimized` prop, so Next.js no longer fetches it. Removed the unused remote image allowlist. Kept the existing placeholder for missing or failed images.
- Files: `frontend/app/components/location-image.tsx`, `frontend/next.config.ts`, `ai/usage-log.md`.
- Verification: `npm.cmd run build` and `npx.cmd eslint app/components/location-image.tsx next.config.ts` passed.
- Human review: Pending human review and browser check of a live image URL.
