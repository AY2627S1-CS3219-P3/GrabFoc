# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (Task 5). Runs with a mocked AWS provider.
# Author review (Jian Bing, 2026-11-06): Not read line by line; ran infra/terraform/check.sh, which runs these
#   tests (all passed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
# Scope: Deploy part 1 (#141): the frontend's own layer, and the gateway's edge listener settings.
# Author review (Jian Bing, 2026-11-07): Looked through the code and think it's okay.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Deploy part 3 (#143): Mailpit's allowlist and API port, the checks task, the Notification Service.
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
# Scope: The AZ-rebalancing check (the staging dry run failed on it).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
# Scope: Checks that Order gets its chat ticket secret and that every gateway route file's URL is set (chat, #230).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
# Scope: Chat on AWS (WIP, see docs/handoff/2026-11-09-aws-chat-handoff.md): expect its repository, database and service.
# Author review: Pending.
# AI-generated (Claude Code).

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
  mailpit_relay_to       = ["a@x.edu", "b@y.com"]
  public_url             = "https://d111.cloudfront.net"
  ecr_repository_urls = {
    # AI-generated (Claude Code).
    "user-service"         = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/user-service"
    "supplier-service"     = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/supplier-service"
    "credit-service"       = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/credit-service"
    "order-service"        = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/order-service"
    "notification-service" = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/notification-service"
    "chat-service"         = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/chat-service"
    "api-gateway"          = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/api-gateway"
    "frontend"             = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/frontend"
    "kafka-init"           = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/kafka-init"
    "checks"               = "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/checks"
  }
}

run "staging" {
  command = apply

  assert {
    condition     = contains(keys(aws_ecs_service.web), "frontend") && !contains(keys(aws_ecs_service.edge), "frontend")
    error_message = "The frontend starts in its own layer after the gateway, so it learns the api-gateway name."
  }
  assert {
    condition = !contains([
      for e in jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].environment : e.name
    ], "GATEWAY_EDGE_PORT")
    error_message = "With edge_container_port 3003 there is no separate edge listener."
  }

  assert {
    condition     = alltrue([for t in aws_ecs_task_definition.service : t.network_mode == "bridge" && t.requires_compatibilities == toset(["EC2"])])
    error_message = "Every task runs in bridge mode on EC2."
  }
  assert {
    condition = [
      for name, t in aws_ecs_task_definition.service : name
      if anytrue([for p in jsondecode(t.container_definitions)[0].portMappings : try(p.hostPort, 0) != 0])
    ] == ["api-gateway", "mailpit"]
    error_message = "Only the gateway and Mailpit's API publish a fixed host port."
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
      try(jsondecode(aws_ecs_task_definition.service["kafka"].container_definitions)[0].hostname, null) == null &&
      [for e in jsondecode(aws_ecs_task_definition.service["kafka"].container_definitions)[0].environment : e.value if e.name == "KAFKA_CONTROLLER_QUORUM_VOTERS"][0] == "1@localhost:9093" &&
      !strcontains([for e in jsondecode(aws_ecs_task_definition.service["kafka"].container_definitions)[0].environment : e.value if e.name == "KAFKA_LISTENERS"][0], "EXTERNAL")
    )
    error_message = "Kafka reaches its own controller on localhost (Service Connect owns the name kafka) and has no host-only EXTERNAL listener."
  }
  assert {
    condition = alltrue([
      for name, folder in { "user-db" = "/data/user-db", "supplier-db" = "/data/supplier-db", "credit-db" = "/data/credit-db", "order-db" = "/data/order-db", "notification-db" = "/data/notification-db", "chat-db" = "/data/chat-db", "user-redis" = "/data/redis", "kafka" = "/data/kafka" } :
      one(aws_ecs_task_definition.service[name].volume).host_path == folder
    ])
    error_message = "Each data store mounts its own folder on the /data volume."
  }
  assert {
    condition = alltrue([
      for name in ["user-db", "supplier-db", "credit-db", "order-db", "notification-db", "chat-db", "user-redis", "kafka", "api-gateway", "mailpit"] :
      local.ecs_services[name].deployment_minimum_healthy_percent == 0 && local.ecs_services[name].deployment_maximum_percent == 100
    ])
    error_message = "Data stores, the gateway and Mailpit are stopped before being replaced: two copies must never share a folder or a host port."
  }
  # First live apply (2026-10-26): a Service Connect client only learns names that existed when its
  # deployment was created, so services are created in layers: data → apps → edge → web.
  assert {
    condition = (
      toset(keys(aws_ecs_service.data)) == toset(["user-db", "supplier-db", "credit-db", "order-db", "notification-db", "chat-db", "user-redis", "kafka", "mailpit"]) &&
      toset(keys(aws_ecs_service.app)) == toset(["user-service", "supplier-service", "credit-service", "order-service", "notification-service", "chat-service"]) &&
      toset(keys(aws_ecs_service.edge)) == toset(["api-gateway"]) &&
      toset(keys(aws_ecs_service.web)) == toset(["frontend"])
    )
    error_message = "Services are created in four layers: data stores, apps, the gateway, then the frontend."
  }
  assert {
    condition = alltrue([
      for s in local.ecs_services : s.desired_count == 1 && !one(s.deployment_circuit_breaker).enable
    ])
    error_message = "One copy of each service; ECS keeps restarting a service until its dependencies are up."
  }
  # AI-generated (Claude Code): the 2026-11-08 staging apply failed on exactly this.
  assert {
    condition     = alltrue([for s in local.ecs_services : s.availability_zone_rebalancing == "DISABLED"])
    error_message = "AZ rebalancing is off on every service: one server in one zone has nothing to rebalance, and ECS refuses a stop-before-replace rollout (maximum 100%) while it is on."
  }
  # AI-generated (Claude Code): chat (#230) made both of these required.
  assert {
    condition     = local.containers["order-service"].secrets["ORDER_CHAT_TICKET_SECRET"] == "CHAT_TICKET_SECRET"
    error_message = "Order refuses to start without ORDER_CHAT_TICKET_SECRET (chat, #230); it comes from the CHAT_TICKET_SECRET parameter, which the chat service will share."
  }
  assert {
    condition = alltrue([
      for f in fileset("${path.module}/../../../../api-gateway/envoy/routes", "*.routes.json") :
      contains(keys(local.containers["api-gateway"].env), jsondecode(file("${path.module}/../../../../api-gateway/envoy/routes/${f}")).urlEnv)
    ])
    error_message = "Every gateway route file's urlEnv is set on api-gateway: the gateway refuses to start when one is missing."
  }
  assert {
    condition = [
      for x in jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].secrets : x.valueFrom
      if x.name == "GATEWAY_ORIGIN_KEY"
    ] == ["arn:aws:ssm:ap-southeast-1:111122223333:parameter/foc/staging/CLOUDFRONT_ORIGIN_KEY"]
    error_message = "The gateway gets CloudFront's origin key from SSM."
  }
  assert {
    condition = (
      contains(keys(local.ecs_services), "mailpit") &&
      [for e in jsondecode(aws_ecs_task_definition.service["user-service"].container_definitions)[0].environment : e.value if e.name == "USER_SMTP_HOST"][0] == "mailpit"
    )
    error_message = "Staging sends mail through Mailpit."
  }
  assert {
    condition = (
      !contains([for e in jsondecode(aws_ecs_task_definition.service["mailpit"].container_definitions)[0].environment : e.name], "MP_SMTP_AUTH_ACCEPT_ANY") &&
      contains([for s in jsondecode(aws_ecs_task_definition.service["mailpit"].container_definitions)[0].secrets : s.name], "MP_SMTP_AUTH")
    )
    error_message = "Mailpit must require the User Service's login, not accept anyone (no open relay to Gmail)."
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
    ]) && length(aws_cloudwatch_log_group.service) == length(aws_ecs_task_definition.service) + 3
    error_message = "One log group per container, /foc/<env>/<name>, kept 14 days."
  }
  # Final review, Critical 1: a standalone run-task gets no Service Connect names, so the one-shot
  # containers run inside the service tasks that need them, before the app container starts.
  assert {
    condition = (
      toset([for c in jsondecode(aws_ecs_task_definition.service["order-service"].container_definitions) : c.name if !c.essential]) == toset(["kafka-init", "order-migrate"]) &&
      toset([for c in jsondecode(aws_ecs_task_definition.service["credit-service"].container_definitions) : c.name if !c.essential]) == toset(["kafka-init"])
    )
    error_message = "order-service runs kafka-init and order-migrate first; credit-service runs kafka-init first."
  }
  assert {
    condition = toset([
      for d in [for c in jsondecode(aws_ecs_task_definition.service["order-service"].container_definitions) : c if c.name == "order-service"][0].dependsOn : "${d.containerName}:${d.condition}"
    ]) == toset(["kafka-init:SUCCESS", "order-migrate:SUCCESS"])
    error_message = "The Order Service starts only after topics and migrations succeed."
  }
  # AI-generated (Claude Code).
  # Deploy part 3: newman reads OTP codes from Mailpit's API on the server's own host port.
  assert {
    condition = anytrue([
      for p in jsondecode(aws_ecs_task_definition.service["mailpit"].container_definitions)[0].portMappings :
      p.containerPort == 8025 && try(p.hostPort, 0) == 8025
    ])
    error_message = "Mailpit's API is on host port 8025."
  }
  # Only listed recipients leave Mailpit: the checks sign up random addresses at a real domain.
  assert {
    condition = (
      local.mailpit_env["MP_SMTP_RELAY_MATCHING"] == "^(a@x\\.edu|b@y\\.com)$" &&
      !contains(keys(local.mailpit_env), "MP_SMTP_RELAY_ALL")
    )
    error_message = "Mailpit relays only the addresses in mailpit_relay_to."
  }
  assert {
    condition = (
      aws_ecs_task_definition.checks[0].family == "foc-staging-checks" &&
      jsondecode(aws_ecs_task_definition.checks[0].container_definitions)[0].image == "111122223333.dkr.ecr.ap-southeast-1.amazonaws.com/foc/checks:abc1234" &&
      {
        for e in jsondecode(aws_ecs_task_definition.checks[0].container_definitions)[0].environment : e.name => e.value
      } == { BASE_URL = "https://d111.cloudfront.net/gateway", MAILPIT_URL = "http://172.17.0.1:8025" } &&
      !contains(keys(local.ecs_services), "checks")
    )
    error_message = "The checks task runs on demand against the public URL, and reads Mailpit through the host."
  }
  # The Notification Service, as in notification-service/compose.yaml.
  assert {
    condition = (
      local.notification_env["NOTIFICATION_SMTP_HOST"] == "mailpit" &&
      local.notification_env["NOTIFICATION_SMTP_PORT"] == "1025" &&
      local.notification_env["NOTIFICATION_FRONTEND_URL"] == "https://d111.cloudfront.net" &&
      local.notification_env["NOTIFICATION_USER_URL"] == "http://user-service:3001" &&
      local.notification_env["NOTIFICATION_KAFKA_BROKERS"] == "kafka:9092" &&
      local.notification_env["NOTIFICATION_DATABASE_URL"] == "postgres://foc@notification-db:5432/notification" &&
      strcontains(jsondecode(aws_ecs_task_definition.service["notification-service"].container_definitions)[0].image, "foc/notification-service:abc1234")
    )
    error_message = "Notification sends through Mailpit, links to the public site, and uses its own database."
  }
  assert {
    condition = {
      for x in jsondecode(aws_ecs_task_definition.service["notification-service"].container_definitions)[0].secrets : x.name => element(split("/", x.valueFrom), 3)
      } == {
      PGPASSWORD                    = "NOTIFICATION_POSTGRES_PASSWORD"
      NOTIFICATION_SMTP_USER        = "USER_SMTP_USER"
      NOTIFICATION_SMTP_PASS        = "USER_SMTP_PASS"
      NOTIFICATION_SMTP_FROM        = "USER_SMTP_FROM"
      NOTIFICATION_USER_SERVICE_KEY = "USER_INTERNAL_SERVICE_KEY"
    }
    error_message = "Notification gets its database password, the mail login and User's internal key from SSM."
  }
  assert {
    condition = contains([
      for x in jsondecode(aws_ecs_task_definition.service["user-service"].container_definitions)[0].secrets : x.name
    ], "USER_INTERNAL_SERVICE_KEY")
    error_message = "The User Service refuses to start without USER_INTERNAL_SERVICE_KEY (#178)."
  }
  assert {
    condition = toset([
      for c in jsondecode(aws_ecs_task_definition.service["notification-service"].container_definitions) : c.name if !c.essential
    ]) == toset(["kafka-init"])
    error_message = "Notification's topics are created before it starts."
  }

  # Final review, Important 5: a container that hangs on start-up is restarted, not left "running".
  # Part 3 final review, I3: deploy-images.sh waits for HEALTHY, so the gateway needs one too.
  assert {
    condition = alltrue([
      for name, t in aws_ecs_task_definition.service : can(jsondecode(t.container_definitions)[0].healthCheck.command[0])
    ])
    # AI-generated (Claude Code).
    error_message = "Every service has a container health check."
  }
  assert {
    condition     = strcontains(join(" ", jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].healthCheck.command), "http://127.0.0.1:3003/health")
    error_message = "The gateway's health check asks its own internal listener for /health."
  }
}

run "production" {
  command = apply
  variables {
    # AI-generated (Claude Code).
    env              = "production"
    cluster_arn      = "arn:aws:ecs:ap-southeast-1:111122223333:cluster/foc-production"
    mailpit_relay    = false
    mailpit_relay_to = []
  }

  assert {
    condition = (
      !contains(keys(local.ecs_services), "mailpit") &&
      [for e in jsondecode(aws_ecs_task_definition.service["user-service"].container_definitions)[0].environment : e.value if e.name == "USER_SMTP_HOST"][0] == "smtp.gmail.com" &&
      [for e in jsondecode(aws_ecs_task_definition.service["user-service"].container_definitions)[0].environment : e.value if e.name == "USER_SMTP_PORT"][0] == "587"
    )
    error_message = "Production sends straight to Gmail on 587, with no Mailpit."
  }
  # AI-generated (Claude Code).
  assert {
    condition     = length(aws_ecs_task_definition.checks) == 0
    error_message = "The checks run on staging only: they need Mailpit."
  }
  assert {
    condition     = local.notification_env["NOTIFICATION_SMTP_HOST"] == "smtp.gmail.com" && local.notification_env["NOTIFICATION_SMTP_PORT"] == "587"
    error_message = "Production Notification sends straight to Gmail."
  }
}

# Final review, Important 6: once Envoy's edge listener exists, internal calls keep using 3003.
run "edge_listener" {
  command = apply
  variables {
    edge_container_port = 8080
  }

  assert {
    condition = {
      for e in jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].environment : e.name => e.value
      if contains(["GATEWAY_EDGE_PORT", "FRONTEND_URL"], e.name)
    } == { GATEWAY_EDGE_PORT = "8080", FRONTEND_URL = "http://frontend:3000" }
    error_message = "The gateway gets its edge port and the frontend's address."
  }

  assert {
    condition = toset([
      for p in jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].portMappings :
      "${p.name}:${p.containerPort}:${try(p.hostPort, 0)}"
    ]) == toset(["api-gateway:3003:0", "edge:8080:80"])
    error_message = "Service Connect keeps api-gateway:3003; host port 80 maps to the edge listener."
  }
}

# AI-generated (Claude Code).
# With nobody on the list, nothing is relayed: an empty regex would mean no filter at all.
run "no_relay_recipients" {
  command = apply
  variables {
    mailpit_relay_to = []
  }

  assert {
    condition     = !contains(keys(local.mailpit_env), "MP_SMTP_RELAY_MATCHING") && !contains(keys(local.mailpit_env), "MP_SMTP_RELAY_ALL")
    error_message = "An empty allowlist relays nothing."
  }
}
