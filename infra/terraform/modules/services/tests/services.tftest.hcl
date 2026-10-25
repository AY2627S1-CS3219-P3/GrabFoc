# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (Task 5). Runs with a mocked AWS provider.
# Author review: Pending Jian Bing's review.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
  mock_data "aws_region" {
    defaults = { region = "ap-southeast-1" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111122223333:role/foc-staging-task-execution" }
  }
  mock_resource "aws_service_discovery_http_namespace" {
    defaults = { arn = "arn:aws:servicediscovery:ap-southeast-1:111122223333:namespace/ns-mock" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:ap-southeast-1:111122223333:task-definition/foc-staging-mock:1" }
  }
}

variables {
  env                    = "staging"
  cluster_arn            = "arn:aws:ecs:ap-southeast-1:111122223333:cluster/foc-staging"
  capacity_provider_name = "foc-staging"
  image_tag              = "abc1234"
  edge_container_port    = 3003
  mailpit_relay          = true
  ecr_repository_urls = {
    "user-service"     = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/user-service"
    "supplier-service" = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/supplier-service"
    "credit-service"   = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/credit-service"
    "order-service"    = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/order-service"
    "api-gateway"      = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/api-gateway"
    "frontend"         = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/frontend"
    "kafka-init"       = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/kafka-init"
  }
}

run "staging" {
  command = apply

  assert {
    condition     = alltrue([for t in aws_ecs_task_definition.service : t.network_mode == "bridge" && t.requires_compatibilities == toset(["EC2"])])
    error_message = "Every task runs in bridge mode on EC2."
  }
  assert {
    condition = [
      for name, t in aws_ecs_task_definition.service : name
      if anytrue([for p in jsondecode(t.container_definitions)[0].portMappings : try(p.hostPort, 0) != 0])
    ] == ["api-gateway"]
    error_message = "Only the gateway publishes a fixed host port."
  }
  assert {
    condition = [
      for p in jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].portMappings : p
      if try(p.hostPort, 0) != 0
      ][0].hostPort == 80 && [
      for p in jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].portMappings : p
      if try(p.hostPort, 0) != 0
    ][0].containerPort == 3003
    error_message = "Host port 80 maps to the gateway's edge_container_port."
  }
  assert {
    condition = alltrue(flatten([
      for t in aws_ecs_task_definition.service : [
        for c in jsondecode(t.container_definitions) : [
          for e in try(c.environment, []) : !contains(local.secret_names, e.name)
        ]
      ]
    ]))
    error_message = "No secret may appear as a plain environment value."
  }
  assert {
    condition = alltrue(flatten([
      for t in aws_ecs_task_definition.service : [
        for c in jsondecode(t.container_definitions) : [
          for s in try(c.secrets, []) : startswith(s.valueFrom, "arn:aws:ssm:ap-southeast-1:111122223333:parameter/foc/staging/")
        ]
      ]
    ]))
    error_message = "Secrets come from SSM under /foc/<env>/."
  }
  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.service["kafka"].container_definitions)[0].hostname == "kafka" &&
      !strcontains([for e in jsondecode(aws_ecs_task_definition.service["kafka"].container_definitions)[0].environment : e.value if e.name == "KAFKA_LISTENERS"][0], "EXTERNAL")
    )
    error_message = "Kafka resolves itself as kafka and has no host-only EXTERNAL listener."
  }
  assert {
    condition = alltrue([
      for name, folder in { "user-db" = "/data/user-db", "supplier-db" = "/data/supplier-db", "credit-db" = "/data/credit-db", "order-db" = "/data/order-db", "user-redis" = "/data/redis", "kafka" = "/data/kafka" } :
      one(aws_ecs_task_definition.service[name].volume).host_path == folder
    ])
    error_message = "Each data store mounts its own folder on the /data volume."
  }
  assert {
    condition = alltrue([
      for name in ["user-db", "supplier-db", "credit-db", "order-db", "user-redis", "kafka", "api-gateway"] :
      aws_ecs_service.service[name].deployment_minimum_healthy_percent == 0 && aws_ecs_service.service[name].deployment_maximum_percent == 100
    ])
    error_message = "Data stores and the gateway are stopped before being replaced: two copies must never share a folder or port 80."
  }
  assert {
    condition = alltrue([
      for s in aws_ecs_service.service : s.desired_count == 1 && !one(s.deployment_circuit_breaker).enable
    ])
    error_message = "One copy of each service; ECS keeps restarting a service until its dependencies are up."
  }
  assert {
    condition = (
      contains(keys(aws_ecs_service.service), "mailpit") &&
      [for e in jsondecode(aws_ecs_task_definition.service["user-service"].container_definitions)[0].environment : e.value if e.name == "USER_SMTP_HOST"][0] == "mailpit"
    )
    error_message = "Staging sends mail through Mailpit."
  }
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement :
      s.Resource == "arn:aws:ssm:ap-southeast-1:111122223333:parameter/foc/staging/*"
    ])
    error_message = "The execution role reads only this environment's parameters."
  }
  assert {
    condition = alltrue([
      for name, g in aws_cloudwatch_log_group.service : g.name == "/foc/staging/${name}" && g.retention_in_days == 14
    ]) && length(aws_cloudwatch_log_group.service) == length(aws_ecs_task_definition.service) + length(aws_ecs_task_definition.oneoff)
    error_message = "One log group per container, /foc/<env>/<name>, kept 14 days."
  }
  assert {
    condition     = toset(keys(aws_ecs_task_definition.oneoff)) == toset(["kafka-init", "order-migrate"])
    error_message = "kafka-init and order-migrate are one-off tasks, not services."
  }
}

run "production" {
  command = apply
  variables {
    env           = "production"
    cluster_arn   = "arn:aws:ecs:ap-southeast-1:111122223333:cluster/foc-production"
    mailpit_relay = false
  }

  assert {
    condition = (
      !contains(keys(aws_ecs_service.service), "mailpit") &&
      [for e in jsondecode(aws_ecs_task_definition.service["user-service"].container_definitions)[0].environment : e.value if e.name == "USER_SMTP_HOST"][0] == "smtp.gmail.com" &&
      [for e in jsondecode(aws_ecs_task_definition.service["user-service"].container_definitions)[0].environment : e.value if e.name == "USER_SMTP_PORT"][0] == "587"
    )
    error_message = "Production sends straight to Gmail on 587, with no Mailpit."
  }
}
