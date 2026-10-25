# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 5).
# Author review: Pending Jian Bing's review.

output "service_names" {
  value = keys(aws_ecs_service.service)
}

output "task_definition_arns" {
  value = { for name, t in aws_ecs_task_definition.service : name => t.arn }
}

output "oneoff_task_families" {
  description = "Run these once per deploy, before updating the services (kafka-init, then order-migrate)."
  value       = { for name, t in aws_ecs_task_definition.oneoff : name => t.family }
}
