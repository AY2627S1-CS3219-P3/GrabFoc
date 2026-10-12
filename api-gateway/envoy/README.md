<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-12
Scope: Document the approved custom Envoy migration and build boundary.
Author review: User approved the approach and implementation; code review pending.
-->

# Custom Envoy gateway

The user approved a custom Envoy build without an authentication helper on 2026-10-12.
The migration preserves the existing gateway HTTP and JWT contract. Envoy sources are
pinned to v1.38.6, commit `58e082ee0eb9f9b06fb46586c4df03dbf269f3f8`.

Local patches extend Envoy's existing native JWT filter rather than implementing
cryptographic primitives. Native sources and build caches live in ignored `.build/`.
Production runs only Envoy; any configuration renderer runs before the image starts.

The current Node gateway remains the reference for compatibility tests. At the user's
request, the main Compose gateway now selects `Dockerfile.envoy`, which builds and tests
the native executable in its own Docker stage. The main stack keeps one
instance per service; load balancing is demonstrated with two isolated test upstreams.

## Build and test from the repository root (PowerShell)

```powershell
docker compose build api-gateway
docker compose up -d --no-deps api-gateway
```

The Dockerfile uses the pinned toolchain to compile six FoC native JWT regressions and
the executable. Source and compiler caches remain in a locked Docker BuildKit cache;
the executable is copied directly between image stages. No local `.build/bin/envoy`
file is required. The first build is substantial; later builds reuse cached dependencies
and compilation. The runtime container replaces its Python
configuration renderer with Envoy, without a Node authentication helper.

If User and Supplier are not running, start the full root stack with
`docker compose up -d --build`. `/health` reports process health,
not upstream readiness. Test authenticated `/locations` through port 3003 for integration.

Run the HTTP comparison suite separately:

```powershell
cd api-gateway
npm ci
npm run build
node --test --test-concurrency=1 test/envoy.integration.mjs
```

The suite uses generated ephemeral signing keys, controlled local upstreams, and
isolated Envoy containers. It compares route, token, header, ID and response behaviour,
tests JWKS rotation/outages, and confirms traffic reaches two Supplier test replicas.
Windows Docker Desktop must allow containers to reach `host.docker.internal`.

For standalone native development, `./api-gateway/envoy/build.ps1` uses a separate
`foc-envoy-native` Docker volume and exports ignored `.build/bin/envoy`. This is optional
and its cache is separate from Dockerfile builds; avoid running both cold builds together.

## Roll back to the Node reference

```powershell
docker compose -f compose.yaml -f api-gateway/compose.node-reference.yaml up -d --build --no-deps api-gateway
```

No service API, database or frontend gateway address changes are needed. The old Node
implementation is not removed by the migration switch. A complete migration requires
passing native and container tests, not just configuration validation.
