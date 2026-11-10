#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Checks on the workflows and the runbook from the deploy part 3 final review (#143).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-06
# Scope: Job timeouts outlast the scripts' own retries (PR #191 review).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
# Scope: Checks that outside actions are pinned to commit hashes, the email secrets reach only the
#   plan step, and Dependabot covers the actions (security review of #191).
# Author review: Pending Jian Bing's review.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-11
# Scope: Job timeouts include the deploy's wait for Terraform's state lock; the PR plan doesn't
#   take the lock.
# Author review: Pending Jian Bing's review.
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
# AI-generated (Claude Code, 2026-11-11): plus up to 15 min waiting for Terraform's state lock
# (lib/state-lock.sh LOCK_WAIT), when an apply is running.
check "production's job outlasts deploy-images.sh at its slowest (~132 min + 15 min lock wait)" '[ "$(timeout deploy-production.yml)" -ge 155 ]'
check "staging's job outlasts push + deploy + checks at their slowest (~187 min + 15 min lock wait)" '[ "$(timeout deploy-staging.yml)" -ge 215 ]'
# A deploy holds the state lock for its whole run; a pull request's plan only reads, so it mustn't
# fail just because a deploy is running.
check "the pull-request plan doesn't take the state lock" 'grep -qE "terraform plan .*-lock=false" "$ROOT/.github/workflows/terraform.yml"'
check "no runbook command continues a line after a comment" '! grep -nE "\\\\[[:space:]]+#" "$ROOT/infra/terraform/README.md"'

# AI-generated (Claude Code, 2026-11-09): a tag can be moved by the action's owner; a full commit
# hash can't. Actions owned by GitHub (actions/, github/) are exempt (security review of #191).
unpinned() { grep -hE "^[[:space:]]*-?[[:space:]]*uses:" "$ROOT"/.github/workflows/*.yml |
  sed -E "s/^[[:space:]]*-?[[:space:]]*uses:[[:space:]]*//" | grep -vE "^(actions|github)/" | grep -vE "@[0-9a-f]{40}( |$)"; }
check "every action not owned by GitHub is pinned to a full commit hash" '[ -z "$(unpinned)" ]'
# Only the plan step needs the email lists; setup and sign-in steps must not see them.
check "the email lists are set on the plan step, not the whole job" '! grep -qE "^ {0,9}TF_VAR_" "$ROOT/.github/workflows/terraform.yml" && grep -qE "^ {10}TF_VAR_alert_emails:" "$ROOT/.github/workflows/terraform.yml"'
check "Dependabot keeps the pinned actions up to date" 'grep -qE "package-ecosystem: \"?github-actions\"?" "$ROOT/.github/dependabot.yml" 2>/dev/null'

echo "$fails failed"
[ "$fails" -eq 0 ]
