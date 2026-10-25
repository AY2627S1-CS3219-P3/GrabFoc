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

module "server" {
  source            = "../../modules/server"
  env               = var.env
  subnet_id         = module.network.subnet_id
  security_group_id = module.network.security_group_id
  instance_type     = var.instance_type
  alert_emails      = var.alert_emails
}

data "aws_ecr_repository" "image" {
  for_each = toset(["user-service", "supplier-service", "credit-service", "order-service", "api-gateway", "frontend", "kafka-init"])
  name     = "foc/${each.key}"
}

module "services" {
  source                 = "../../modules/services"
  env                    = var.env
  cluster_arn            = module.server.cluster_arn
  capacity_provider_name = module.server.capacity_provider_name
  ecr_repository_urls    = { for name, r in data.aws_ecr_repository.image : name => r.repository_url }
  image_tag              = var.image_tag
  edge_container_port    = var.edge_container_port
  mailpit_relay          = var.env == "staging" # staging relays through Mailpit; production sends to Gmail
}

# The secret CloudFront adds to every request (X-Origin-Key) and Envoy checks, so the server answers
# only this distribution, not any CloudFront. Generated here; the gateway reads it from SSM.
resource "random_password" "origin_key" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "origin_key" {
  name  = "/foc/${var.env}/CLOUDFRONT_ORIGIN_KEY"
  type  = "SecureString"
  value = random_password.origin_key.result
}

module "edge" {
  source        = "../../modules/edge"
  env           = var.env
  origin_domain = module.server.public_dns
  origin_key    = random_password.origin_key.result
}
