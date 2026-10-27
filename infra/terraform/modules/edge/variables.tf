# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 6).
# Author review: Pending Jian Bing's review.

variable "env" {
  description = "Environment name (staging or production)."
  type        = string
}

variable "origin_key" {
  description = "Secret CloudFront sends as X-Origin-Key, so Envoy can reject requests that didn't come through this distribution."
  type        = string
  sensitive   = true
}

variable "origin_domain" {
  description = "The ECS server's public DNS name (its Elastic IP's)."
  type        = string
}
