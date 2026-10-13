<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Document official Envoy startup, integration tests, and per-service JSON route configuration.
Author review: User approved stock defaults; generated changes review pending.
-->

# Stock Envoy gateway

The user chose the official Envoy defaults on 2026-10-13. The runtime uses official
`envoyproxy/envoy:v1.38.6`, pinned by digest in `Dockerfile.envoy`. Python renders configuration
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
`10-user.routes.json`, and Supplier routes in `20-supplier.routes.json`.
Each file declares a `service` (upstream cluster name), `urlEnv` (the service URL's
environment variable), and a `routes` array. JSON files carry their AI disclosure
in the first `_disclosure` field because JSON does not support comments.

Each route has a `method` and either an exact `path` or a `regex`. JWT authentication
is required unless `"public": true` is explicitly set. Paths are forwarded unchanged;
regex matching does not rewrite them. Declared `prefixes` support placeholders such
as `{auth}` and `{locations}` using an environment variable and a default value.
The renderer escapes substituted prefixes in regex routes. Health and the final
404 response remain shared renderer configuration.

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
npm ci
npm run build
node --test --test-concurrency=1 test/envoy.integration.mjs
```

Tests use ephemeral signing keys and isolated upstreams; they verify retained service
contracts and deliberate differences from the Node reference. See
[behaviour differences](behaviour-differences.md). Two test Supplier replicas demonstrate
round-robin balancing; the main stack still has one instance per service.

## Roll back

```powershell
docker compose -f compose.yaml -f api-gateway/compose.node-reference.yaml up -d --build --no-deps api-gateway
```

The Node reference is retained for comparison and rollback. Old downloaded sources and
native caches remain ignored and are not used by the image build.
