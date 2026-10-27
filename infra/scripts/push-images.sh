#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 7).
#        2026-10-27 (Claude Code, Claude Opus 5.5): fixes from the Codex review on PR #146.
# Author review: Pending Jian Bing's review.
#
# One-off manual build and push of every image to ECR, until the CI workflow (deploy part 3) does it.
#   infra/scripts/push-images.sh "$(git rev-parse --short HEAD)"
# Builds for linux/amd64 (the t3 server), from the same contexts as the compose files. Safe to rerun
# with the same tag: images already in ECR are skipped.
set -euo pipefail

tag="${1:?usage: $0 <image tag, e.g. the commit SHA>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
region="ap-southeast-1"
registry="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$region.amazonaws.com"

aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"

# image name | build context | Dockerfile (relative to the repo root)
images=(
  "user-service|user-service|user-service/Dockerfile"
  "supplier-service|.|supplier-service/Dockerfile"
  "credit-service|credit-service|credit-service/Dockerfile"
  "order-service|order-service|order-service/Dockerfile"
  "api-gateway|api-gateway|api-gateway/Dockerfile"
  "frontend|frontend|frontend/Dockerfile"
  "kafka-init|infra/kafka|infra/kafka/Dockerfile.init"
)
for entry in "${images[@]}"; do
  IFS='|' read -r name context dockerfile <<< "$entry"
  image="$registry/foc/$name:$tag"
  # ECR tags are immutable, so a tag pushed by an earlier, interrupted run is already final.
  if aws ecr describe-images --region "$region" --repository-name "foc/$name" \
    --image-ids imageTag="$tag" > /dev/null 2>&1; then
    echo "== $image already in ECR, skipped"
    continue
  fi
  echo "== $image"
  # One plain image per tag: Docker Desktop's default attestations push an extra manifest first,
  # which takes the tag and makes ECR (immutable tags) reject the real image.
  docker build --platform linux/amd64 --provenance=false --sbom=false \
    -t "$image" -f "$root/$dockerfile" "$root/$context"
  docker push "$image"
done
