# AI Usage Log — FoC (CS3219 AY26/27 S1, Group 3)

Required by Appendix 2 of the project document: *"Maintain a log, `/ai/usage-log.md`, in the
repository with timestamps, prompts, and usage scenarios."* Every AI-assisted change needs an
entry here. AI-influenced files other than this log also need a disclosure header.

## How to add an entry

- Work under **your own `##` heading**. Five people appending to the end of one file conflicts
  on every pull request; editing separate sections does not.
- Newest entry first within your section.
- One entry per pull request. Record the **exact prompts** — paraphrases do not meet the
  policy — but summarise the responses.
- Say what you **rejected or changed**. That is the evidence you reviewed the output rather
  than pasting it.

Template:

```
### YYYY-MM-DD — <what you were doing> (PR #N)
**Tool:** <tool (model)> · **Mode:** generate | refactor | debug | explain
**Files:** <paths>

**Scenario:** why you used it and what for.

**Prompts:**
> exact prompt text

**What it produced:** …
**What I changed or rejected:** …
**Verification:** how you checked it.
```

---

## Zi Yi

<!-- Add your entries here. -->

---

## Deanson

<!-- Add your entries here. -->

## Cole Lin

<!-- Add your entries here. -->

## Jian Bing

<!-- Add your entries here. -->

## Jie Yang

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
