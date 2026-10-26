<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Document Envoy startup, tests, standard Dockerfile and the approved JWKS failure response exception.
Author review: User approved stock defaults; generated changes review pending.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Listed the Order route file.
Author review: Pending review by Deanson.
Scope: Listed the Credit route file (#61).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
Scope: Documented the /gateway prefix (#141).
Author review: Pending Jie Yang's review.
-->

# Stock Envoy gateway

The user chose the official Envoy defaults on 2026-10-13. The runtime uses official
`envoyproxy/envoy:v1.38.6`, pinned by digest in `Dockerfile`. Python renders configuration
and then replaces itself with Envoy. No helper service, custom compiler, native patch,
release pipeline or unpublished base image is involved.

## Start from the repository root

```powershell
docker compose up -d --build --no-deps api-gateway
```

Use `docker compose up -d --build` if User/Supplier are not already running. The gateway
keeps port 3003 and the frontend's `api-gateway:3003` address. Health is at `/health`.
The first build downloads the image and installs Python; subsequent builds cache that
layer. Editing the renderer, route files or Lua header filter only copies those files.

## Route files

`render.py` reads `routes/*.routes.json` in filename order. The User routes live in
`10-user.routes.json`, Supplier routes in `20-supplier.routes.json`, Order routes
(approved by Jie Yang, 2026-10-22; never `/internal/**`) in `30-order.routes.json`, and
Credit's balance and history reads in `40-credit.routes.json` (Credit's `/internal` and
`/admin` routes are not routed).
Each file declares a `service` (upstream cluster name), `urlEnv` (the service URL's
environment variable), and a `routes` array. JSON files carry their AI disclosure
in the first `_disclosure` field because JSON does not support comments.

Each route has a `method` and either an exact `path` or a `regex`. JWT authentication
is required unless `"public": true` is explicitly set. Paths are forwarded unchanged;
regex matching does not rewrite them. Declared `prefixes` support placeholders such
as `{auth}`, `{locations}` and `{orders}` using an environment variable and a default value.
The renderer escapes substituted prefixes in regex routes. Health and the final
404 response remain shared renderer configuration.

Every route is also served under `/gateway` (for example `/gateway/locations`), with the prefix
removed before forwarding. That is the public API path on AWS, and Postman uses it locally too, so
only `baseUrl` differs. Unprefixed paths stay for the frontend's server-side calls. `/internal/**`
is not routed under either form.

For an additional service with team-approved endpoints, add another `*.routes.json`
file and set its `urlEnv` variable in the gateway Compose environment and
`.env.example`. Keep the service reachable on the Compose network, add integration
and Postman coverage, then rebuild/restart the gateway. No renderer changes are
needed for ordinary routes. File and array order determine precedence; put specific
routes before broader regex routes. Missing URLs, duplicate service names and
malformed route definitions fail startup rather than being silently ignored.

Run the route-loader tests from the repository root:

```powershell
python api-gateway/test/envoy_routes_test.py
```

## Verify accepted behaviour

```powershell
cd api-gateway
node --test --test-concurrency=1 test/envoy.integration.mjs
```

Tests require Node.js 20+ and Docker and use only built-in Node modules; no npm
install or TypeScript build is needed. They use ephemeral signing keys and isolated
upstreams to verify routing and the accepted stock Envoy behavior. See
[behaviour differences](behaviour-differences.md). Two test Supplier replicas demonstrate
round-robin balancing; the main stack still has one instance per service.

## Migration history

The legacy Node gateway, its tests, npm manifests, Dockerfile and rollback Compose
file were removed at the user's request after the Envoy checks passed. Historical
comparison results remain in the behaviour-differences document and Git history.

## JWKS availability failures

JWT failure metadata drives a response-status override in `compatibility.lua`:
fetch failures, malformed/missing/non-array keys and empty/no-valid-key sets return
503 text. The original verifier error body remains unchanged. Unknown key IDs,
invalid signatures and expired tokens retain their authentication errors. Service
401 responses are unaffected. The frontend treats 503 as a temporary failure and
preserves existing or successfully rotated session cookies. Its BFF currently
presents non-JSON profile errors as 500 initially or 502 after rotation; session
preservation is verified separately from that browser error status.

The status-code mapping is verified on pinned Envoy 1.38.6; rerun the gateway and
frontend session tests when upgrading. This is an explicit user-approved exception
to stock Envoy defaults, requiring no custom binary or helper service.
