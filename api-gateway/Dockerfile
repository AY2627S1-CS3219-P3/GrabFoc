# syntax=docker/dockerfile:1
# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-13
# Scope: Package the official precompiled Envoy release, renderer and per-service route files in the gateway's standard Dockerfile.
# Author review: Pending human review.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
# Scope: Copy frontend.lua and expose the edge listener port 8080 (deploy part 1, #141).
# Author review: Pending Jie Yang's review.
# AI-generated; review pending.
FROM envoyproxy/envoy:v1.38.6@sha256:93a82e7584cb8181ad408e4e49477a3ae1d775f698214841eda4e9309fc06a06
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY envoy/render.py envoy/compatibility.lua envoy/frontend.lua /opt/foc/
COPY envoy/routes/ /opt/foc/routes/
USER 65532:65532
EXPOSE 3003 8080
ENTRYPOINT ["python3", "/opt/foc/render.py", "/tmp/foc-envoy.json", "--exec"]
