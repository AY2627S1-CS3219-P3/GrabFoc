#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Checks on the workflows and the runbook from the deploy part 3 final review (#143).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-06
# Scope: Job timeouts outlast the scripts' own retries (PR #191 review).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
#
# Run: infra/scripts/test/repo-checks.test.sh
# AI-generated (Claude Code).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }

# I1: GitHub prints a job's env values in the public log unless they are secrets.
check "the email lists come from secrets, not variables" '! grep -rq "vars\.TF_VAR_" "$ROOT/.github/workflows"'
# A backslash before a comment escapes the space, not the newline, and the command stops there.
# AI-generated (Claude Code, 2026-11-06): a job timeout shorter than the scripts' own
# retries kills a slow deploy halfway, before the script can fail cleanly (PR #191 review).
timeout() { grep -m1 -oE "timeout-minutes: [0-9]+" "$ROOT/.github/workflows/$1" | grep -oE "[0-9]+"; }
check "production's job outlasts deploy-images.sh at its slowest (~132 min)" '[ "$(timeout deploy-production.yml)" -ge 140 ]'
check "staging's job outlasts push + deploy + checks at their slowest (~187 min)" '[ "$(timeout deploy-staging.yml)" -ge 200 ]'
check "no runbook command continues a line after a comment" '! grep -nE "\\\\[[:space:]]+#" "$ROOT/infra/terraform/README.md"'

echo "$fails failed"
[ "$fails" -eq 0 ]
