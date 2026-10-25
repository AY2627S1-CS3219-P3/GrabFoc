# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (Task 4). Plan-only with a mocked AWS provider: the data
#        volume has prevent_destroy, so the test never applies (and so never has to destroy) it.
# Author review: Pending Jian Bing's review.

mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = { value = "ami-0123456789abcdef0" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
  mock_data "aws_region" {
    defaults = { region = "ap-southeast-1" }
  }
}

override_resource {
  target          = aws_ebs_volume.data
  override_during = plan
  values          = { id = "vol-0abc123", arn = "arn:aws:ec2:ap-southeast-1:111122223333:volume/vol-0abc123" }
}

override_resource {
  target          = aws_eip.server
  override_during = plan
  values          = { id = "eipalloc-0abc", allocation_id = "eipalloc-0abc", public_dns = "ec2-1-2-3-4.ap-southeast-1.compute.amazonaws.com" }
}

variables {
  alert_emails      = ["team@example.com"]
  env               = "staging"
  subnet_id         = "subnet-0abc"
  security_group_id = "sg-0abc"
  az                = "ap-southeast-1a"
  instance_type     = "t3.large"
}

run "server" {
  command = plan

  assert {
    condition = (
      aws_launch_template.server.metadata_options[0].http_tokens == "required" &&
      aws_launch_template.server.metadata_options[0].http_put_response_hop_limit == 1
    )
    error_message = "IMDSv2 required with hop limit 1, so containers can't read the server's credentials."
  }
  assert {
    condition     = aws_launch_template.server.key_name == null
    error_message = "No SSH key: shell access is through Session Manager."
  }
  assert {
    condition = (
      aws_autoscaling_group.server.min_size == 1 && aws_autoscaling_group.server.max_size == 1 &&
      aws_autoscaling_group.server.desired_capacity == 1 &&
      length(aws_autoscaling_group.server.vpc_zone_identifier) == 1
    )
    error_message = "Exactly one server, in the one subnet."
  }
  assert {
    condition = (
      aws_ebs_volume.data.availability_zone == "ap-southeast-1a" &&
      aws_ebs_volume.data.type == "gp3" && aws_ebs_volume.data.encrypted
    )
    error_message = "Data volume: gp3, encrypted, in the server's zone."
  }
  assert {
    condition = toset([for a in aws_iam_role_policy_attachment.server : a.policy_arn]) == toset([
      "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
      "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    ])
    error_message = "The server role needs the ECS agent and Session Manager policies."
  }
  assert {
    condition = strcontains(local.user_data, "ECS_CLUSTER=foc-staging") && strcontains(
      local.user_data, "mkdir -p /data/user-db /data/supplier-db /data/credit-db /data/order-db /data/redis /data/kafka"
    ) && strcontains(local.user_data, "chown 1000:1000 /data/kafka")
    error_message = "User data must join the cluster and prepare the /data folders."
  }
  assert {
    condition     = strcontains(local.user_data, "blkid") && strcontains(local.user_data, "mkfs") && length(split("blkid", local.user_data)[0]) < length(split("mkfs", local.user_data)[0])
    error_message = "User data must check for a filesystem (blkid) before formatting (mkfs)."
  }
  assert {
    condition = (
      aws_cloudwatch_metric_alarm.disk.metric_name == "disk_used_percent" &&
      aws_cloudwatch_metric_alarm.disk.dimensions["path"] == "/data" &&
      aws_cloudwatch_metric_alarm.disk.threshold == 80
    )
    error_message = "Alarm when /data passes 80% full."
  }

  # Final review (2026-10-25), Critical 2: a server whose start-up fails must never join the cluster.
  assert {
    condition = (
      strcontains(local.user_data, "dnf install -y awscli-2") &&
      strcontains(local.user_data, "trap 'shutdown -h now' ERR") &&
      strcontains(local.user_data, "mountpoint -q /data") &&
      !strcontains(local.user_data, "exit 1") &&
      length(split("mountpoint -q /data", local.user_data)[0]) < length(split("ECS_CLUSTER=", local.user_data)[0])
    )
    error_message = "Install the AWS CLI, shut down on any error, and join the cluster only once /data is mounted."
  }
  # Final review, Important 8: the disk alarm must reach a person, and a silent agent counts as a problem.
  assert {
    condition = (
      length(aws_cloudwatch_metric_alarm.disk.alarm_actions) == 1 &&
      aws_cloudwatch_metric_alarm.disk.treat_missing_data == "breaching" &&
      aws_sns_topic_subscription.alerts["team@example.com"].protocol == "email"
    )
    error_message = "The disk alarm emails the team, and missing data raises it."
  }
  # Final review, Important 4: services may use the capacity provider only once it's attached to the cluster.
  assert {
    condition     = output.capacity_provider_name == "foc-staging"
    error_message = "capacity_provider_name comes from the cluster association."
  }
}
