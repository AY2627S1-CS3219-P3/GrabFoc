<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Document official Envoy startup, integration tests, and removal of custom native builds.
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
layer. Editing the renderer or Lua header filter only copies those files.

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
