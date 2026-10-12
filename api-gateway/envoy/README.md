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

The current Node gateway remains the reference until the custom binary passes native
and HTTP integration tests. The main Compose stack keeps one instance per service;
load balancing is demonstrated with two isolated test upstreams.

Build and runtime instructions will be added alongside the implementation. A complete
migration requires compilation and container tests, not just configuration validation.
