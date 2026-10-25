# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 4).
# Author review: Pending Jian Bing's review.

variable "env" {
  description = "Environment name (staging or production)."
  type        = string
}

variable "subnet_id" {
  description = "The public subnet the server runs in."
  type        = string
}

variable "security_group_id" {
  description = "The server's security group (CloudFront on 80 only)."
  type        = string
}

variable "az" {
  description = "Availability zone: the server and its data volume must share it."
  type        = string
  default     = "ap-southeast-1a"
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.large"
}

variable "data_volume_gb" {
  description = "Size of the /data volume (PostgreSQL, Redis and Kafka)."
  type        = number
  default     = 20
}
