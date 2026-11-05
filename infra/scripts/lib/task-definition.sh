# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Tasks 3 and 4).
# Author review: Pending Jian Bing's review.
#
# Shared by deploy-images.sh and run-checks.sh. Both set $region first.

# Registers a copy of a task definition with every image from our foc/ ECR repositories on <tag>,
# and prints the new revision's ARN. Other images (databases, Mailpit) stay as they are.
register_with_tag() {
  local definition="$1" tag="$2" json arn
  json=$(mktemp)
  aws ecs describe-task-definition --region "$region" --task-definition "$definition" \
    --query taskDefinition --output json | jq --arg tag "$tag" '
      .containerDefinitions |= map(
        if (.image | test("/foc/[^/:]+:")) then .image |= sub(":[^:]+$"; ":" + $tag) else . end
      )
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
            .registeredAt, .registeredBy, .deregisteredAt)' > "$json"
  arn=$(aws ecs register-task-definition --region "$region" --cli-input-json "file://$json" \
    --query taskDefinition.taskDefinitionArn --output text)
  rm -f "$json"
  echo "$arn"
}
