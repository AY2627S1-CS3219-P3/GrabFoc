# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 4).
#        2026-10-27 (Claude Code, Claude Opus 5.5): fixes from the Codex review on PR #146.
# Author review: Pending Jian Bing's review.
# The environment's one ECS server (spec §3.1) and its persistent data volume (spec §4). The server
# can be replaced at any time; the volume and the Elastic IP outlive it.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

locals {
  name = "foc-${var.env}"
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region            = data.aws_region.current.region
    cluster           = local.name
    eip_allocation_id = aws_eip.server.allocation_id
    volume_id         = aws_ebs_volume.data.id
    volume_id_nodash  = replace(aws_ebs_volume.data.id, "-", "")
  })
}

resource "aws_ecs_cluster" "this" {
  name = local.name
}

# --- Persistent data and address ---------------------------------------------------------------

resource "aws_ebs_volume" "data" {
  availability_zone = var.az
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${local.name}-data" }

  lifecycle {
    prevent_destroy = true # every database lives here
  }
}

resource "aws_eip" "server" {
  domain = "vpc"
  tags   = { Name = local.name }
}

# --- Server identity ---------------------------------------------------------------------------

resource "aws_iam_role" "server" {
  name = "${local.name}-server"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "server" {
  for_each = toset([
    "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])
  role       = aws_iam_role.server.name
  policy_arn = each.value
}

resource "aws_iam_role_policy" "server_start_up" {
  name = "start-up"
  role = aws_iam_role.server.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "ec2:AttachVolume"
        Resource = [
          aws_ebs_volume.data.arn,
          "arn:aws:ec2:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:instance/*",
        ]
      },
      {
        Effect = "Allow"
        Action = "ec2:AssociateAddress"
        Resource = [
          "arn:aws:ec2:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:elastic-ip/${aws_eip.server.allocation_id}",
          "arn:aws:ec2:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:instance/*",
          "arn:aws:ec2:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:network-interface/*",
        ]
      },
      { Effect = "Allow", Action = ["ec2:DescribeVolumes", "cloudwatch:PutMetricData"], Resource = "*" },
    ]
  })
}

resource "aws_iam_instance_profile" "server" {
  name = "${local.name}-server"
  role = aws_iam_role.server.name
}

# --- The server ------------------------------------------------------------------------------------

resource "aws_launch_template" "server" {
  name_prefix   = "${local.name}-"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = var.instance_type
  user_data     = base64encode(local.user_data)

  iam_instance_profile {
    arn = aws_iam_instance_profile.server.arn
  }

  network_interfaces {
    subnet_id                   = var.subnet_id
    security_groups             = [var.security_group_id]
    associate_public_ip_address = true
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1 # containers can't reach the server's credentials
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = local.name }
  }
}

resource "aws_autoscaling_group" "server" {
  name                = local.name
  min_size            = 1
  max_size            = 1
  desired_capacity    = 1
  vpc_zone_identifier = [var.subnet_id]
  # A brand-new instance profile can take a minute to work, so the first launch may fail; the group
  # retries by itself. Don't make Terraform wait for (and fail on) that first attempt.
  wait_for_capacity_timeout = "0"

  launch_template {
    id      = aws_launch_template.server.id
    version = aws_launch_template.server.latest_version
  }

  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }
}

resource "aws_ecs_capacity_provider" "server" {
  name = local.name
  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.server.arn
    managed_termination_protection = "DISABLED"
    managed_scaling {
      status = "DISABLED"
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = [aws_ecs_capacity_provider.server.name]
  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.server.name
    weight            = 1
  }
}

# --- Disk alarm ------------------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email" # each address confirms once, from the email AWS sends
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "disk" {
  alarm_name          = "${local.name}-data-disk-80"
  alarm_description   = "The /data volume is more than 80% full"
  namespace           = "CWAgent"
  metric_name         = "disk_used_percent"
  dimensions          = { AutoScalingGroupName = aws_autoscaling_group.server.name, path = "/data" }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  treat_missing_data  = "breaching" # no data means the agent stopped reporting: worth an email too
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
