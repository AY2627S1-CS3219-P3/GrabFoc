# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 6).
# Author review (Jian Bing, 2026-11-06): Not read line by line; ran infra/terraform/check.sh, which validates
#   this stack (every stack valid).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
# Scope: images_url, the location photos' base URL for the Supplier Service.
# Author review: Pending Jian Bing's review.
# AI-generated (Claude Code).

output "url" {
  description = "The environment's public URL."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}

# AI-generated (Claude Code, 2026-11-10): the Supplier Service's SUPPLIER_IMAGE_BASE_URL.
output "images_url" {
  description = "Public base URL of the location photos."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}/images"
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}
