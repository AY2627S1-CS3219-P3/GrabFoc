#!/bin/sh
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Task 2).
# Author review: Pending Jian Bing's review.
#
# The checks container's entrypoint. Exits with newman's status: non-zero if any check failed.
# AI-generated (Claude Code); review pending.
set -eu
: "${BASE_URL:?BASE_URL must be set}"
: "${MAILPIT_URL:?MAILPIT_URL must be set}"

node /checks/select.mjs /checks/collection.json /tmp/checks.json "$BASE_URL" "$MAILPIT_URL"
exec newman run /tmp/checks.json --reporters cli --color off
