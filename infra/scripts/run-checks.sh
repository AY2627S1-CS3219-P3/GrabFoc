#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Task 4).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
#
# Runs the Postman checks as a one-off task on staging, prints their output, and exits with their
# status. Only a pass records the tag as ready for production.
#   infra/scripts/run-checks.sh staging "$(git rev-parse --short=7 HEAD)"
# AI-generated (Claude Code).
set -euo pipefail

env="${1:-}"
tag="${2:-}"
if [ "$env" != staging ] || [ -z "$tag" ]; then
  echo "usage: $0 staging <tag>" >&2
  exit 2
fi

region="ap-southeast-1"
cluster="foc-staging"
# shellcheck source=lib/task-definition.sh
. "$(dirname "$0")/lib/task-definition.sh"

definition=$(register_with_tag foc-staging-checks "$tag")
started=$(aws ecs run-task --region "$region" --cluster "$cluster" --task-definition "$definition" \
  --launch-type EC2 --started-by "checks-$tag" --output json)
task=$(jq -r '.tasks[0].taskArn // empty' <<< "$started")
if [ -z "$task" ]; then
  echo "the checks task didn't start: $(jq -r '.failures[0].reason // "no reason given"' <<< "$started")" >&2
  exit 1
fi
echo "== checks task ${task##*/}"

# The AWS waiter gives up after 10 minutes.
stopped=false
for round in 1 2 3; do
  if aws ecs wait tasks-stopped --region "$region" --cluster "$cluster" --tasks "$task"; then
    stopped=true
    break
  fi
  echo "== still running after round $round"
done

# Awslogs stream: <prefix>/<container>/<task id>. Their absence mustn't change the result.
aws logs tail /foc/staging/checks --region "$region" --since 1h \
  --log-stream-name-prefix "checks/checks/${task##*/}" --format short || true

if [ "$stopped" != true ]; then
  echo "the checks task didn't finish in 30 minutes" >&2
  exit 1
fi

result=$(aws ecs describe-tasks --region "$region" --cluster "$cluster" --tasks "$task" --output json)
code=$(jq -r '.tasks[0].containers[] | select(.name == "checks") | .exitCode // "none"' <<< "$result")
if [ "$code" = none ]; then
  echo "the checks container never ran: $(jq -r '.tasks[0].stoppedReason // "no reason given"' <<< "$result")" >&2
  exit 1
fi
if [ "$code" != 0 ]; then
  echo "the checks failed (exit code $code); $tag is not recorded as passed" >&2
  exit "$code"
fi

aws ssm put-parameter --region "$region" --name /foc-deploy/staging/passed-tag --type String --overwrite \
  --value "$tag" > /dev/null
echo "== checks passed for $tag"
