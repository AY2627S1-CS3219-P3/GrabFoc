<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Separate custom native releases from everyday gateway builds; document first release and rollback.
Author review: User approved workflow separation; generated documentation review pending.
-->

# Custom Envoy gateway

FoC uses a custom native Envoy build without an authentication helper. The source is
pinned to v1.38.6, commit `58e082ee0eb9f9b06fb46586c4df03dbf269f3f8`.
`foc-jwt.patch` extends the existing verifier and request-ID handling. The Node gateway
remains the compatibility reference until native and HTTP acceptance tests pass.

## Everyday builds

`Dockerfile.envoy` uses a prebuilt custom base and copies only `render.py` and
`compatibility.lua`. Normal Compose builds never invoke Bazel or native tests.

```powershell
docker compose up -d --build --no-deps api-gateway
```

The default base is `ghcr.io/ay2627s1-cs3219-p3/grabfoc-envoy:v1.38.6-foc.1`.
**This initial image is not available until the first release is published.** Configure
`FOC_ENVOY_BASE_IMAGE` in the root `.env` to select a released tag, preferably the digest
reported by the release workflow. Private GHCR packages require `docker login ghcr.io`
with package-read access. Credentials belong in Docker's credential store, never this repo.

If the full stack is absent, use `docker compose up -d --build`. The gateway keeps
`api-gateway:3003`; `/health` checks process health, not upstream availability.

## Native releases

`Dockerfile.envoy-release` owns the expensive source compilation and six native JWT
regressions. Only changes to the pinned Envoy source, native patch, native tests or
extension selection require a new native image. Routing/configuration edits do not.

The manually dispatched **Custom Envoy release** GitHub workflow:

1. Validates a new `v1.38.6-foc.N` tag and refuses an already published tag.
2. Builds the custom base and runs its native tests.
3. Builds the lightweight gateway using the locally built base.
4. Runs real-token HTTP compatibility and two-replica load-balancing tests.
5. Pushes the base to GHCR only when explicitly dispatched with `publish: true` and all checks pass.

The workflow is not triggered by ordinary pushes or pull requests. It uses the repository
`GITHUB_TOKEN` with package-write permission, without a committed personal token. It builds
Linux amd64; additional architectures need separately compiled and verified native releases.
The workflow must exist on the default branch before GitHub exposes its dispatch control.

For a local release using the existing BuildKit cache:

```powershell
docker build -f api-gateway/Dockerfile.envoy-release -t foc-envoy-native:v1.38.6-foc.1 api-gateway
$env:FOC_ENVOY_BASE_IMAGE = 'foc-envoy-native:v1.38.6-foc.1'
docker compose build api-gateway
cd api-gateway
npm ci
npm run build
node --test --test-concurrency=1 test/envoy.integration.mjs
```

Do not run this concurrently with the original cold build: they use the same locked
BuildKit cache. The original in-progress full-image build can finish unchanged. When
successful, its existing `foc-envoy:local` image already contains the native executable
and can temporarily serve as a local base by setting `FOC_ENVOY_BASE_IMAGE=foc-envoy:local`.
It is not a verified release until the HTTP tests also pass.

`envoy/build.ps1` is an optional native-development build with a separate Docker volume;
it is not used by Compose or the release workflow. Avoid duplicate cold builds.

## HTTP acceptance and rollback

The comparison suite creates ephemeral signing keys, controlled upstreams and isolated
Envoy containers. It checks routes, signatures, strict expiry/not-before, key IDs and
rotation, JWKS outages, forwarded responses, stripped headers, request IDs and balancing.
Docker Desktop uses `host.docker.internal`; Linux tests add a host-gateway mapping.

```powershell
docker compose -f compose.yaml -f api-gateway/compose.node-reference.yaml up -d --build --no-deps api-gateway
```

This rollback uses the existing Node Dockerfile. Service APIs, databases and the frontend
address stay unchanged. Keep the Node source until the tests pass and removal is requested.
