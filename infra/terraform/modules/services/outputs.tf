# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 5).
# Author review: Pending Jian Bing's review.

output "service_names" {
  value = keys(local.ecs_services)
}

output "task_definition_arns" {
  value = { for name, t in aws_ecs_task_definition.service : name => t.arn }
}

