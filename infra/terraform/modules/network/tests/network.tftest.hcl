# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 3).
# Author review: Pending Jian Bing's review.

mock_provider "aws" {
  mock_data "aws_ec2_managed_prefix_list" {
    defaults = { id = "pl-mock" }
  }
}

variables {
  env  = "staging"
  cidr = "10.20.0.0/16"
}

run "network" {
  command = apply

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.cloudfront.from_port == 80 &&
      aws_vpc_security_group_ingress_rule.cloudfront.to_port == 80 &&
      aws_vpc_security_group_ingress_rule.cloudfront.ip_protocol == "tcp" &&
      aws_vpc_security_group_ingress_rule.cloudfront.prefix_list_id == "pl-mock"
    )
    error_message = "Inbound from outside must be TCP 80 from the CloudFront prefix list only."
  }
  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.cloudfront.cidr_ipv4 == null &&
      aws_vpc_security_group_ingress_rule.self.cidr_ipv4 == null &&
      aws_vpc_security_group_ingress_rule.cloudfront.cidr_ipv6 == null &&
      aws_vpc_security_group_ingress_rule.self.cidr_ipv6 == null
    )
    error_message = "No ingress rule may open a CIDR range."
  }
  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.self.referenced_security_group_id == aws_security_group.server.id &&
      aws_vpc_security_group_ingress_rule.self.ip_protocol == "-1"
    )
    error_message = "The self rule must allow all traffic between members of the security group."
  }
  assert {
    condition = (
      aws_route.internet.destination_cidr_block == "0.0.0.0/0" &&
      aws_route.internet.gateway_id == aws_internet_gateway.this.id &&
      aws_subnet.public.map_public_ip_on_launch
    )
    error_message = "The subnet must be public: default route to the internet gateway, public IPs on launch."
  }
  assert {
    condition     = aws_subnet.public.availability_zone == "ap-southeast-1a" && aws_vpc.this.tags["Name"] == "foc-staging"
    error_message = "Subnet in ap-southeast-1a; resources named foc-<env>."
  }
}
