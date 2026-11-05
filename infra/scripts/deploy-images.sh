#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Task 3).
# Author review: Pending Jian Bing's review.
#
# Rolls an image tag onto an environment's services, in the order Service Connect needs: the apps,
# then the gateway, then the frontend. The images must already be in ECR (push-images.sh).
#   infra/scripts/deploy-images.sh staging "$(git rev-parse --short=7 HEAD)"
# The tag is recorded only once every layer is stable, so a manual terraform apply keeps it, and a
# deploy that fails halfway leaves the record on the last good tag.
set -euo pipefail

env="${1:-}"
tag="${2:-}"
case "$env" in
  staging | production) ;;
  *) echo "usage: $0 staging|production <tag>" >&2; exit 2 ;;
esac
[ -n "$tag" ] || { echo "usage: $0 staging|production <tag>" >&2; exit 2; }

region="ap-southeast-1"
cluster="foc-$env"
# shellcheck source=lib/task-definition.sh
. "$(dirname "$0")/lib/task-definition.sh"

roll() {
  local service current arn
  for service in "$@"; do
    current=$(aws ecs describe-services --region "$region" --cluster "$cluster" --services "$service" \
      --query 'services[0].taskDefinition' --output text)
    arn=$(register_with_tag "$current" "$tag")
    aws ecs update-service --region "$region" --cluster "$cluster" --service "$service" \
      --task-definition "$arn" > /dev/null
    echo "== $service: $arn"
  done
}

# The AWS waiter gives up after 10 minutes; a rollout with Kafka's init container can take longer.
wait_stable() {
  local round
  for round in 1 2 3; do
    if aws ecs wait services-stable --region "$region" --cluster "$cluster" --services "$@"; then
      return 0
    fi
    echo "== not stable yet after round $round: $*"
  done
  echo "not stable after three rounds: $*. The recorded tag hasn't changed." >&2
  return 1
}

roll_layer() {
  roll "$@"
  wait_stable "$@"
}

roll_layer user-service supplier-service credit-service order-service notification-service
roll_layer api-gateway
roll_layer frontend

aws ssm put-parameter --region "$region" --name "/foc-deploy/$env/image-tag" --type String --overwrite \
  --value "$tag" > /dev/null
echo "== $env now runs $tag"
