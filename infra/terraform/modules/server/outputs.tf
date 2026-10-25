# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 4).
# Author review: Pending Jian Bing's review.

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "capacity_provider_name" {
  value = aws_ecs_capacity_provider.server.name
}

output "public_dns" {
  description = "The Elastic IP's public DNS name: CloudFront's origin."
  value       = aws_eip.server.public_dns
}

output "data_volume_id" {
  value = aws_ebs_volume.data.id
}
