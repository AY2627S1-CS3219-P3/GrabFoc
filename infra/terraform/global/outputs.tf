# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 1).
# Author review: Pending Jian Bing's review.

output "state_bucket" {
  description = "S3 bucket holding every environment's Terraform state."
  value       = aws_s3_bucket.state.bucket
}

output "ecr_repository_urls" {
  description = "ECR repository URL per image name."
  value       = { for name, r in aws_ecr_repository.service : name => r.repository_url }
}

output "github_role_arns" {
  description = "IAM roles GitHub Actions assumes through OIDC."
  value       = { for name, r in aws_iam_role.github : name => r.arn }
}
