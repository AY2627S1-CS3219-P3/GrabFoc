# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 5).
# Author review: Pending Jian Bing's review.

variable "env" {
  description = "Environment name (staging or production)."
  type        = string
}

variable "cluster_arn" {
  description = "The environment's ECS cluster."
  type        = string
}

variable "capacity_provider_name" {
  description = "Capacity provider of the environment's ECS server."
  type        = string
}

variable "ecr_repository_urls" {
  description = "ECR repository URL per image name (global stack output)."
  type        = map(string)
}

variable "image_tag" {
  description = "Image tag (the commit SHA) every service runs."
  type        = string
}

variable "edge_container_port" {
  description = "Envoy container port published on host port 80."
  type        = number
  default     = 3003
}

variable "mailpit_relay" {
  description = "Run Mailpit as a relay to Gmail and send the User Service's mail through it (staging only)."
  type        = bool
}
