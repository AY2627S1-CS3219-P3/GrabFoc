# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 2).
# Author review: Pending Jian Bing's review.

variable "env" {
  description = "Environment name, used in every resource name (foc-<env>-…)."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type of the environment's one ECS server."
  type        = string
  default     = "t3.large"
}

variable "image_tag" {
  description = "Image tag (the commit SHA) every service runs."
  type        = string
}

variable "edge_container_port" {
  description = "Envoy container port published on host port 80: 3003 until deploy part 1 adds the edge listener, then 80."
  type        = number
  default     = 3003
}
