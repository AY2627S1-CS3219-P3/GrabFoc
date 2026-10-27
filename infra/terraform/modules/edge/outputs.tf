# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 6).
# Author review: Pending Jian Bing's review.

output "url" {
  description = "The environment's public URL."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}
