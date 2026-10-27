#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 2).
# Author review: Pending Jian Bing's review.
# The Terraform checks CI runs on every pull request, runnable locally the same way:
#   infra/terraform/check.sh
# No AWS credentials needed: init skips the backend and the tests mock the AWS provider.
set -euo pipefail
cd "$(dirname "$0")"

terraform fmt -check -recursive
for dir in global modules/* envs/*; do
  [ -d "$dir" ] || continue
  echo "== $dir"
  # A throwaway working folder, so checks never touch a stack already initialised against real
  # state (and need no AWS login), even on a machine that has deployed.
  data_dir=$(mktemp -d)
  TF_DATA_DIR="$data_dir" terraform -chdir="$dir" init -backend=false -input=false >/dev/null
  TF_DATA_DIR="$data_dir" terraform -chdir="$dir" validate -no-color
  if [ -d "$dir/tests" ]; then TF_DATA_DIR="$data_dir" terraform -chdir="$dir" test -no-color; fi
  rm -rf "$data_dir"
done
