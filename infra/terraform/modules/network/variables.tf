# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 3).
# Author review: Pending Jian Bing's review.

variable "env" {
  description = "Environment name (staging or production)."
  type        = string
}

variable "cidr" {
  description = "The VPC's address range."
  type        = string
}

variable "az" {
  description = "Availability zone of the subnet (and of the server and its data volume)."
  type        = string
  default     = "ap-southeast-1a"
}
