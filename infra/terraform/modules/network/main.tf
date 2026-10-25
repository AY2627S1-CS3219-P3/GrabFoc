# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 3).
# Author review: Pending Jian Bing's review.
# One VPC with one public subnet (spec §3.2). Nothing is private: the security group is what keeps
# the server closed, letting in only CloudFront on port 80.

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_hostnames = true # the server's public DNS name is CloudFront's origin
  tags                 = { Name = "foc-${var.env}" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.cidr, 8, 0)
  availability_zone       = var.az
  map_public_ip_on_launch = true
  tags                    = { Name = "foc-${var.env}-public" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "foc-${var.env}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "foc-${var.env}-public" }
}

resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "server" {
  name        = "foc-${var.env}-server"
  description = "FoC ${var.env} ECS server: HTTP from CloudFront only"
  vpc_id      = aws_vpc.this.id
}

resource "aws_vpc_security_group_ingress_rule" "cloudfront" {
  security_group_id = aws_security_group.server.id
  description       = "Envoy, from CloudFront only"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

# ECS bridge mode publishes container ports on dynamic host ports; this lets them reach each other.
resource "aws_vpc_security_group_ingress_rule" "self" {
  security_group_id            = aws_security_group.server.id
  description                  = "Containers on the same server"
  ip_protocol                  = "-1"
  referenced_security_group_id = aws_security_group.server.id
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.server.id
  description       = "Outbound: ECR, SSM, Gmail SMTP, package updates"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
