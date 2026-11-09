# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 2).
# Author review (Jian Bing, 2026-11-06): Went through it with Claude Code's walkthrough and understood it; ran
#   infra/terraform/check.sh (every stack valid, all tests passed) and checked staging (the locations list and
#   the admin locations page load).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Deploy part 3 (#143): the tag comes from Parameter Store unless given; checks and Notification images.
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# The staging environment: one VPC, one ECS-on-EC2 server, every container as an ECS service, and
# CloudFront in front (spec §3). Module calls are added by later tasks.
# AI-generated (Claude Code).

module "network" {
  source = "../../modules/network"
  env    = var.env
  cidr   = "10.20.0.0/16"
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
  # AI-generated (Claude Code).
  for_each = toset([
    "user-service", "supplier-service", "credit-service", "order-service", "notification-service",
    "api-gateway", "frontend", "kafka-init", "checks",
  ])
  name = "foc/${each.key}"
}

# The deploy workflow records what it rolled out, so a manual apply never puts an older tag back.
data "aws_ssm_parameter" "image_tag" {
  count = var.image_tag == null ? 1 : 0
  name  = "/foc-deploy/${var.env}/image-tag"
}

locals {
  image_tag = var.image_tag != null ? var.image_tag : data.aws_ssm_parameter.image_tag[0].insecure_value
}

module "services" {
  source                 = "../../modules/services"
  env                    = var.env
  cluster_arn            = module.server.cluster_arn
  capacity_provider_name = module.server.capacity_provider_name
  ecr_repository_urls    = { for name, r in data.aws_ecr_repository.image : name => r.repository_url }
  image_tag              = local.image_tag
  edge_container_port    = var.edge_container_port
  mailpit_relay          = var.env == "staging" # staging relays through Mailpit; production sends to Gmail
  mailpit_relay_to       = var.mailpit_relay_to
  public_url             = module.edge.url
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
