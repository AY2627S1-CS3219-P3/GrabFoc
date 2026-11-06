# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 4).
# Author review (Jian Bing, 2026-11-06): Not read line by line; ran infra/terraform/check.sh, which validates
#   this stack (every stack valid).
# AI-generated (Claude Code).

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "capacity_provider_name" {
  # Read from the cluster association, so services are created only after it exists.
  value = tolist(aws_ecs_cluster_capacity_providers.this.capacity_providers)[0]
}

output "public_dns" {
  description = "The Elastic IP's public DNS name: CloudFront's origin."
  value       = aws_eip.server.public_dns
}

output "data_volume_id" {
  value = aws_ebs_volume.data.id
}
