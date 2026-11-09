#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Task 3). Final review fixes: stop
#        before any change if a service is missing; a layer is done only when it's healthy.
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-06
# Scope: Stop before any change if a foc/ image the services run is missing on the tag (PR #191 review).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
#
# Rolls an image tag onto an environment's services, in the order Service Connect needs: the apps,
# then the gateway, then the frontend. The images must already be in ECR (push-images.sh).
#   infra/scripts/deploy-images.sh staging "$(git rev-parse --short=7 HEAD)"
# The tag is recorded only once every layer is healthy, so a manual terraform apply keeps it, and a
# deploy that fails halfway leaves the record on the last good tag.
# AI-generated (Claude Code).
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
# How long a layer may take to turn healthy after it is stable: checks x interval seconds.
health_checks="${HEALTH_CHECKS:-20}"
health_interval="${HEALTH_INTERVAL:-15}"
# shellcheck source=lib/task-definition.sh
. "$(dirname "$0")/lib/task-definition.sh"

layers=(
  "user-service supplier-service credit-service order-service notification-service logging-service"
  "api-gateway"
  "frontend"
)

# Every service must exist before anything changes, or a deploy to an environment that hasn't had
# its terraform apply would stop halfway through a layer.
# shellcheck disable=SC2086,SC2048 # the layers are space-separated service names
current=$(aws ecs describe-services --region "$region" --cluster "$cluster" --services ${layers[*]} --output json)
missing=$(jq -r '[.failures[]?.arn | split("/") | last] + [.services[] | select(.status != "ACTIVE") | .serviceName] | join(" ")' <<< "$current")
if [ -n "$missing" ]; then
  echo "$cluster has no $missing. Run terraform apply for $env first; nothing was changed." >&2
  exit 1
fi

# AI-generated (Claude Code, 2026-11-06): every foc/ image the services run must exist
# on the tag before anything changes. A half-pushed tag (or a mistyped rollback) would otherwise leave
# services on task definitions whose images can't be pulled.
repos=()
for definition in $(jq -r '.services[].taskDefinition' <<< "$current"); do
  images=$(aws ecs describe-task-definition --region "$region" --task-definition "$definition" \
    --query taskDefinition --output json | jq -r '.containerDefinitions[].image')
  # shellcheck disable=SC2207 # repository names contain no spaces
  repos+=($(grep -o -E '/foc/[^/:]+:' <<< "$images" | sed -E 's|^/||; s|:$||' || true))
done
for repo in $(printf '%s\n' ${repos[@]+"${repos[@]}"} | sort -u); do
  if ! aws ecr describe-images --region "$region" --repository-name "$repo" --image-ids imageTag="$tag" > /dev/null; then
    echo "$repo has no image $tag. Push it first (push-images.sh); nothing was changed." >&2
    exit 1
  fi
done

roll() {
  local service arn
  rolled_services=()
  rolled_arns=()
  for service in "$@"; do
    arn=$(register_with_tag "$(jq -r --arg s "$service" '.services[] | select(.serviceName == $s) | .taskDefinition' <<< "$current")" "$tag")
    aws ecs update-service --region "$region" --cluster "$cluster" --service "$service" \
      --task-definition "$arn" > /dev/null
    echo "== $service: $arn"
    rolled_services+=("$service")
    rolled_arns+=("$arn")
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

# Prints the service's running tasks if its primary deployment is <arn> and every running task is
# on <arn> and HEALTHY; fails otherwise.
healthy() {
  local service="$1" arn="$2" primary tasks
  primary=$(aws ecs describe-services --region "$region" --cluster "$cluster" --services "$service" --output json |
    jq -r '.services[0].deployments[] | select(.status == "PRIMARY") | .taskDefinition')
  [ "$primary" = "$arn" ] || return 1
  tasks=$(aws ecs list-tasks --region "$region" --cluster "$cluster" --service-name "$service" \
    --desired-status RUNNING --output json | jq -r '.taskArns | sort | join(" ")')
  [ -n "$tasks" ] || return 1
  # shellcheck disable=SC2086 # task ARNs contain no spaces
  aws ecs describe-tasks --region "$region" --cluster "$cluster" --tasks $tasks --output json |
    jq -e --arg arn "$arn" 'all(.tasks[]; .taskDefinitionArn == $arn and .healthStatus == "HEALTHY")' > /dev/null ||
    return 1
  echo "$tasks"
}

# "Stable" only means the running count is right: a gateway that starts and then fails can pass it.
# Each service must be healthy on its new revision twice in a row, with the same tasks (a task
# that crashed in between is a new task).
wait_healthy() {
  local i _ seen now
  for i in "${!rolled_services[@]}"; do
    seen=""
    for _ in $(seq "$health_checks"); do
      if now=$(healthy "${rolled_services[$i]}" "${rolled_arns[$i]}") && [ "$now" = "$seen" ]; then
        echo "== ${rolled_services[$i]} healthy"
        continue 2
      fi
      seen="${now:-}"
      sleep "$health_interval"
    done
    echo "${rolled_services[$i]} isn't healthy on ${rolled_arns[$i]##*/}. The recorded tag hasn't changed." >&2
    return 1
  done
}

for layer in "${layers[@]}"; do
  # shellcheck disable=SC2086
  roll $layer
  # shellcheck disable=SC2086
  wait_stable $layer
  wait_healthy
done

aws ssm put-parameter --region "$region" --name "/foc-deploy/$env/image-tag" --type String --overwrite \
  --value "$tag" > /dev/null
echo "== $env now runs $tag"
