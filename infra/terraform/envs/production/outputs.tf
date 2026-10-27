# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 6).
# Author review: Pending Jian Bing's review.

output "url" {
  description = "The environment's public HTTPS URL."
  value       = module.edge.url
}

output "cluster_name" {
  value = module.server.cluster_name
}

