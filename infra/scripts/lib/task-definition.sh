# shellcheck shell=bash disable=SC2154 # $region is set by the script that sources this
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Tasks 3 and 4). Final review fix:
#        a failed describe or register returns non-zero instead of an empty ARN.
# Author review: Pending Jian Bing's review.
#
# Shared by deploy-images.sh and run-checks.sh. Both set $region first.
# AI-generated (Claude Code); review pending.

# Registers a copy of a task definition with every image from our foc/ ECR repositories on <tag>,
# and prints the new revision's ARN. Other images (databases, Mailpit) stay as they are. Returns
# non-zero if anything fails: callers run under set -e, which doesn't reach inside $(...).
register_with_tag() {
  local definition="$1" tag="$2" raw json arn
  raw=$(mktemp)
  json=$(mktemp)
  if ! aws ecs describe-task-definition --region "$region" --task-definition "$definition" \
    --query taskDefinition --output json > "$raw" ||
    ! jq --arg tag "$tag" '
      .containerDefinitions |= map(
        if (.image | test("/foc/[^/:]+:")) then .image |= sub(":[^:]+$"; ":" + $tag) else . end
      )
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
            .registeredAt, .registeredBy, .deregisteredAt)' "$raw" > "$json"; then
    rm -f "$raw" "$json"
    echo "couldn't read $definition" >&2
    return 1
  fi
  arn=$(aws ecs register-task-definition --region "$region" --cli-input-json "file://$json" \
    --query taskDefinition.taskDefinitionArn --output text) || arn=""
  rm -f "$raw" "$json"
  case "$arn" in
    arn:aws:ecs:*:task-definition/*) echo "$arn" ;;
    *) echo "couldn't register a copy of $definition" >&2; return 1 ;;
  esac
}
