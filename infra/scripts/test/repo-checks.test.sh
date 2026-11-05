#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Checks on the workflows and the runbook from the deploy part 3 final review (#143).
# Author review: Pending Jian Bing's review.
#
# Run: infra/scripts/test/repo-checks.test.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }

# I1: GitHub prints a job's env values in the public log unless they are secrets.
check "the email lists come from secrets, not variables" '! grep -rq "vars\.TF_VAR_" "$ROOT/.github/workflows"'
# A backslash before a comment escapes the space, not the newline, and the command stops there.
check "no runbook command continues a line after a comment" '! grep -nE "\\\\[[:space:]]+#" "$ROOT/infra/terraform/README.md"'

echo "$fails failed"
[ "$fails" -eq 0 ]
