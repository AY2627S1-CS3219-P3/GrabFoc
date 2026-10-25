# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 2).
# Author review: Pending Jian Bing's review.
# The production environment: one VPC, one ECS-on-EC2 server, every container as an ECS service, and
# CloudFront in front (spec §3). Module calls are added by later tasks.

module "network" {
  source = "../../modules/network"
  env    = var.env
  cidr   = "10.30.0.0/16"
}
