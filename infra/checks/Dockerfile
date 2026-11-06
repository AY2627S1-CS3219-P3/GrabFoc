# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Task 2).
# Author review: Pending Jian Bing's review.
#
# Build context is the repository root, for the Postman collection:
#
#   docker build -f infra/checks/Dockerfile -t foc-checks .
# AI-generated (Claude Code); review pending.

FROM postman/newman:6.1.3-alpine
WORKDIR /checks
COPY api-gateway/postman/gateway.postman_collection.json collection.json
COPY infra/checks/select.mjs infra/checks/run.sh ./
# A renamed Postman folder fails here, instead of quietly running fewer checks.
RUN node select.mjs collection.json /tmp/checked.json http://build.invalid http://build.invalid
ENTRYPOINT ["/checks/run.sh"]
