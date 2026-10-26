# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 5).
# Author review: Pending Jian Bing's review.
# Every container from the compose files as an ECS service on the environment's one server (spec
# §3.1, §4, §5). Values match the compose files; anything secret comes from SSM /foc/<env>/<NAME>.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  region     = data.aws_region.current.region
  ssm_prefix = "arn:aws:ssm:${local.region}:${data.aws_caller_identity.current.account_id}:parameter/foc/${var.env}"
  image      = { for name, url in var.ecr_repository_urls : name => "${url}:${var.image_tag}" }

  # Mail: production sends straight to Gmail; staging sends to Mailpit, which keeps a copy and relays
  # every message to Gmail (spec §6).
  smtp = var.mailpit_relay ? { host = "mailpit", port = "1025" } : { host = "smtp.gmail.com", port = "587" }

  postgres = {
    for name, cfg in {
      "user-db"     = { db = "users", password = "POSTGRES_PASSWORD" }
      "supplier-db" = { db = "supplier", password = "SUPPLIER_POSTGRES_PASSWORD" }
      "credit-db"   = { db = "credit", password = "CREDIT_POSTGRES_PASSWORD" }
      "order-db"    = { db = "orders", password = "ORDER_DB_PASSWORD" }
      } : name => {
      image    = "postgres:17-alpine"
      port     = 5432
      memory   = 192
      folder   = "/data/${name}"
      mount_to = "/var/lib/postgresql/data"
      env      = { POSTGRES_USER = "foc", POSTGRES_DB = cfg.db }
      health   = ["CMD-SHELL", "pg_isready -U foc -d ${cfg.db}"]
      secrets  = { POSTGRES_PASSWORD = cfg.password }
    }
  }

  # name => image, port, memory reservation (MiB), env, secrets (env name => SSM name), and for
  # data stores the /data folder they keep their files in.
  containers = merge(local.postgres, {
    "user-redis" = {
      image    = "redis:7-alpine"
      port     = 6379
      memory   = 64
      folder   = "/data/redis"
      mount_to = "/data"
      command  = ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec"]
      health   = ["CMD", "redis-cli", "ping"]
      env      = {}
      secrets  = {}
    }
    "kafka" = {
      image    = "apache/kafka:4.1.0"
      port     = 9092
      memory   = 768
      folder   = "/data/kafka"
      mount_to = "/var/lib/kafka/data"
      health   = ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 > /dev/null 2>&1"]
      env = {
        KAFKA_NODE_ID                                  = "1"
        KAFKA_PROCESS_ROLES                            = "broker,controller"
        KAFKA_LISTENERS                                = "PLAINTEXT://:9092,CONTROLLER://:9093"
        KAFKA_ADVERTISED_LISTENERS                     = "PLAINTEXT://kafka:9092"
        KAFKA_LISTENER_SECURITY_PROTOCOL_MAP           = "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT"
        KAFKA_CONTROLLER_LISTENER_NAMES                = "CONTROLLER"
        KAFKA_CONTROLLER_QUORUM_VOTERS                 = "1@localhost:9093" # Service Connect owns the name kafka (its proxy, 9092 only)
        KAFKA_INTER_BROKER_LISTENER_NAME               = "PLAINTEXT"
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR         = "1"
        KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR = "1"
        KAFKA_TRANSACTION_STATE_LOG_MIN_ISR            = "1"
        KAFKA_AUTO_CREATE_TOPICS_ENABLE                = "false"
        KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS         = "0"
        KAFKA_LOG_DIRS                                 = "/var/lib/kafka/data"
        KAFKA_LOG_RETENTION_HOURS                      = "168"       # one week ...
        KAFKA_LOG_RETENTION_BYTES                      = "268435456" # ... or 256 MiB per partition, so Kafka can't fill /data
        KAFKA_HEAP_OPTS                                = "-Xms256m -Xmx512m"
      }
      secrets = {}
    }
    "user-service" = {
      image  = local.image["user-service"]
      port   = 3001
      health = local.listening[3001]
      memory = 192
      env = {
        USER_PORT          = "3001"
        USER_REDIS_URL     = "redis://user-redis:6379"
        USER_SMTP_HOST     = local.smtp.host
        USER_SMTP_PORT     = local.smtp.port
        USER_ORDER_URL     = "http://order-service:3005"
        USER_KAFKA_BROKERS = "kafka:9092"
      }
      secrets = {
        USER_DATABASE_URL          = "USER_DATABASE_URL"
        USER_AES_KEY               = "USER_AES_KEY"
        USER_EMAIL_HMAC_KEY        = "USER_EMAIL_HMAC_KEY"
        USER_OTP_HMAC_KEY          = "USER_OTP_HMAC_KEY"
        USER_JWT_PRIVATE_KEY       = "USER_JWT_PRIVATE_KEY"
        USER_JWT_KID               = "USER_JWT_KID"
        USER_SMTP_USER             = "USER_SMTP_USER"
        USER_SMTP_PASS             = "USER_SMTP_PASS"
        USER_SMTP_FROM             = "USER_SMTP_FROM"
        USER_BOOTSTRAP_ADMIN_EMAIL = "USER_BOOTSTRAP_ADMIN_EMAIL"
        USER_ORDER_SERVICE_KEY     = "ORDER_SERVICE_KEY"
      }
    }
    "supplier-service" = {
      image  = local.image["supplier-service"]
      port   = 3002
      health = local.listening[3002]
      memory = 192
      env = {
        SUPPLIER_PORT     = "3002"
        SUPPLIER_JWKS_URL = "http://user-service:3001/.well-known/jwks.json"
      }
      secrets = { SUPPLIER_DATABASE_URL = "SUPPLIER_DATABASE_URL" }
    }
    "credit-service" = {
      image  = local.image["credit-service"]
      port   = 3004
      health = local.listening[3004]
      memory = 192
      env = {
        CREDIT_PORT          = "3004"
        CREDIT_DATABASE_URL  = "postgres://foc@credit-db:5432/credit" # password from PGPASSWORD, as in compose
        CREDIT_JWKS_URL      = "http://user-service:3001/.well-known/jwks.json"
        CREDIT_KAFKA_BROKERS = "kafka:9092"
        CREDIT_RETRY_DELAYS  = "1s,5s,30s,2m,10m"
      }
      secrets = { PGPASSWORD = "CREDIT_POSTGRES_PASSWORD", CREDIT_SERVICE_KEY = "CREDIT_SERVICE_KEY" }
    }
    "order-service" = {
      image  = local.image["order-service"]
      port   = 3005
      health = local.listening[3005]
      memory = 192
      env = merge(local.order_db_env, {
        ORDER_PORT          = "3005"
        ORDER_JWKS_URL      = "http://user-service:3001/.well-known/jwks.json"
        ORDER_SUPPLIER_URL  = "http://supplier-service:3002"
        ORDER_CREDIT_URL    = "http://credit-service:3004"
        ORDER_KAFKA_BROKERS = "kafka:9092"
      })
      secrets = {
        ORDER_DB_PASSWORD        = "ORDER_DB_PASSWORD"
        ORDER_CREDIT_SERVICE_KEY = "CREDIT_SERVICE_KEY"
        ORDER_SERVICE_KEY        = "ORDER_SERVICE_KEY"
      }
    }
    "api-gateway" = {
      image     = local.image["api-gateway"]
      port      = 3003
      host_port = 80 # the only port the server publishes; CloudFront's origin
      memory    = 96
      env = {
        GATEWAY_PORT         = "3003"
        USER_SERVICE_URL     = "http://user-service:3001"
        SUPPLIER_SERVICE_URL = "http://supplier-service:3002"
        ORDER_SERVICE_URL    = "http://order-service:3005"
        CREDIT_SERVICE_URL   = "http://credit-service:3004"
      }
      # CloudFront's X-Origin-Key value; Envoy rejects port-80 requests without it (deploy part 1).
      secrets = { GATEWAY_ORIGIN_KEY = "CLOUDFRONT_ORIGIN_KEY" }
    }
    "frontend" = {
      image   = local.image["frontend"]
      port    = 3000
      health  = local.listening[3000]
      memory  = 384
      env     = { FRONTEND_GATEWAY_URL = "http://api-gateway:3003" }
      secrets = {}
    }
    }, var.mailpit_relay ? {
    "mailpit" = {
      image  = "axllent/mailpit:v1.31.2"
      health = ["CMD", "/mailpit", "readyz"]
      port   = 1025
      memory = 48
      env = {
        MP_SMTP_AUTH_ALLOW_INSECURE = "true" # plain login over the server's internal network
        MP_SMTP_RELAY_HOST          = "smtp.gmail.com"
        MP_SMTP_RELAY_PORT          = "587"
        MP_SMTP_RELAY_STARTTLS      = "true"
        MP_SMTP_RELAY_AUTH          = "login"
        MP_SMTP_RELAY_ALL           = "true"
      }
      secrets = {
        # Only the User Service knows this login ("<USER_SMTP_USER>:<USER_SMTP_PASS>", the credentials
        # it already sends), so no other container can relay mail through the Gmail account.
        MP_SMTP_AUTH           = "MAILPIT_SMTP_AUTH"
        MP_SMTP_RELAY_USERNAME = "USER_SMTP_USER"
        MP_SMTP_RELAY_PASSWORD = "USER_SMTP_PASS"
      }
    }
  } : {})

  # Node services: healthy once something listens on the port (catches a start-up that hangs).
  listening = {
    for port in [3000, 3001, 3002, 3004, 3005] : port => [
      "CMD", "node", "-e",
      "require('net').connect(${port},'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))",
    ]
  }

  order_db_env = { ORDER_DB_HOST = "order-db", ORDER_DB_PORT = "5432", ORDER_DB_NAME = "orders", ORDER_DB_USER = "foc" }

  # One-shot containers. A standalone run-task gets no Service Connect names (kafka, order-db), so
  # they run inside the service tasks that need them, and the app container waits for them to
  # succeed. Both are idempotent: topics use --if-not-exists, migrations are versioned.
  oneoffs = {
    "kafka-init"    = { image = local.image["kafka-init"], memory = 256, command = null, env = {}, secrets = {} }
    "order-migrate" = { image = local.image["order-service"], memory = 128, command = ["node", "dist/db/migrate-cli.js"], env = local.order_db_env, secrets = { ORDER_DB_PASSWORD = "ORDER_DB_PASSWORD" } }
  }

  # Environment variable names that carry secrets, and the SSM names they come from.
  secret_names = distinct(flatten([for c in merge(local.containers, local.oneoffs) : concat(keys(c.secrets), values(c.secrets))]))

  init_containers = {
    "order-service"  = ["kafka-init", "order-migrate"]
    "credit-service" = ["kafka-init"]
  }

  stops_before_replacing = toset(["user-db", "supplier-db", "credit-db", "order-db", "user-redis", "kafka", "api-gateway"])
}

# --- Shared plumbing -------------------------------------------------------------------------------

resource "aws_service_discovery_http_namespace" "this" {
  name = "foc-${var.env}" # Service Connect: containers keep their compose names
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = merge(local.containers, local.oneoffs)
  name              = "/foc/${var.env}/${each.key}"
  retention_in_days = 14
}

resource "aws_iam_role" "execution" {
  name = "foc-${var.env}-task-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-environment-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["ssm:GetParameters"], Resource = "${local.ssm_prefix}/*" }]
  })
}

# --- Task definitions --------------------------------------------------------------------------------

locals {
  container_definition = {
    for name, c in merge(local.containers, local.oneoffs) : name => merge(
      {
        name              = name
        image             = c.image
        essential         = true
        memoryReservation = c.memory
        memory            = c.memory * 2
        environment       = [for k in sort(keys(c.env)) : { name = k, value = c.env[k] }]
        secrets           = [for k in sort(keys(c.secrets)) : { name = k, valueFrom = "${local.ssm_prefix}/${c.secrets[k]}" }]
        logConfiguration = {
          logDriver = "awslogs"
          options = {
            "awslogs-group"         = "/foc/${var.env}/${name}"
            "awslogs-region"        = local.region
            "awslogs-stream-prefix" = name
          }
        }
      },
      try(c.port, null) == null ? {} : {
        portMappings = concat(
          # The internal port: Service Connect's name:port (for Envoy, the frontend's api-gateway:3003).
          [merge(
            { name = name, containerPort = c.port, protocol = "tcp" },
            # Until Envoy's edge listener exists, the public port 80 maps to this same port.
            try(c.host_port, null) != null && var.edge_container_port == c.port ? { hostPort = c.host_port } : {},
          )],
          try(c.host_port, null) != null && var.edge_container_port != c.port ? [
            { name = "edge", containerPort = var.edge_container_port, hostPort = c.host_port, protocol = "tcp" }
          ] : [],
        )
      },
      try(c.folder, null) == null ? {} : { mountPoints = [{ sourceVolume = "data", containerPath = c.mount_to }] },
      try(c.command, null) == null ? {} : { command = c.command },
      try(c.health, null) == null ? {} : {
        healthCheck = { command = c.health, interval = 15, timeout = 5, retries = 5, startPeriod = name == "kafka" ? 120 : 60 }
      },
      contains(keys(local.oneoffs), name) ? { essential = false } : {},
      length(lookup(local.init_containers, name, [])) == 0 ? {} : {
        dependsOn = [for i in local.init_containers[name] : { containerName = i, condition = "SUCCESS" }]
      },
    )
  }
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.containers
  family                   = "foc-${var.env}-${each.key}"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.execution.arn
  container_definitions = jsonencode(concat(
    [local.container_definition[each.key]],
    [for i in lookup(local.init_containers, each.key, []) : local.container_definition[i]],
  ))

  dynamic "volume" {
    for_each = try(each.value.folder, null) == null ? [] : [each.value.folder]
    content {
      name      = "data"
      host_path = volume.value
    }
  }
}

# --- Services ----------------------------------------------------------------------------------------

# Created in three layers: a Service Connect client only learns the names that already existed when
# its deployment was created (first live apply, 2026-10-26). Data stores first, then the apps that
# use them, then Envoy and the frontend that call the apps.
#
# ECS has no depends_on between running services: a service whose database or Kafka isn't up yet
# exits (or fails its health check) and is restarted until it is. A circuit breaker would stop
# those restarts, so it stays off. Data stores (one folder each) and the gateway (host port 80)
# stop before their replacement starts; the rest roll with a brief overlap.
locals {
  layer = {
    data = toset(["user-db", "supplier-db", "credit-db", "order-db", "user-redis", "kafka", "mailpit"])
    app  = toset(["user-service", "supplier-service", "credit-service", "order-service"])
    edge = toset(["api-gateway", "frontend"])
  }
  ecs_services = merge(aws_ecs_service.data, aws_ecs_service.app, aws_ecs_service.edge)
}

resource "aws_ecs_service" "data" {
  for_each        = { for k, v in local.containers : k => v if contains(local.layer.data, k) }
  name            = each.key
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider_name
    weight            = 1
  }

  deployment_circuit_breaker {
    enable   = false
    rollback = false
  }

  deployment_minimum_healthy_percent = contains(local.stops_before_replacing, each.key) ? 0 : 100
  deployment_maximum_percent         = contains(local.stops_before_replacing, each.key) ? 100 : 200

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.this.arn
    service {
      port_name      = each.key
      discovery_name = each.key
      client_alias {
        dns_name = each.key
        port     = each.value.port
      }
    }
  }
}

resource "aws_ecs_service" "app" {
  for_each        = { for k, v in local.containers : k => v if contains(local.layer.app, k) }
  name            = each.key
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = 1

  depends_on = [aws_ecs_service.data]

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider_name
    weight            = 1
  }

  deployment_circuit_breaker {
    enable   = false
    rollback = false
  }

  deployment_minimum_healthy_percent = contains(local.stops_before_replacing, each.key) ? 0 : 100
  deployment_maximum_percent         = contains(local.stops_before_replacing, each.key) ? 100 : 200

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.this.arn
    service {
      port_name      = each.key
      discovery_name = each.key
      client_alias {
        dns_name = each.key
        port     = each.value.port
      }
    }
  }
}

resource "aws_ecs_service" "edge" {
  for_each        = { for k, v in local.containers : k => v if contains(local.layer.edge, k) }
  name            = each.key
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = 1

  depends_on = [aws_ecs_service.app]

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider_name
    weight            = 1
  }

  deployment_circuit_breaker {
    enable   = false
    rollback = false
  }

  deployment_minimum_healthy_percent = contains(local.stops_before_replacing, each.key) ? 0 : 100
  deployment_maximum_percent         = contains(local.stops_before_replacing, each.key) ? 100 : 200

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.this.arn
    service {
      port_name      = each.key
      discovery_name = each.key
      client_alias {
        dns_name = each.key
        port     = each.value.port
      }
    }
  }
}

# Services created before the layers existed keep running: same services, new addresses.
moved {
  from = aws_ecs_service.service["user-db"]
  to   = aws_ecs_service.data["user-db"]
}

moved {
  from = aws_ecs_service.service["supplier-db"]
  to   = aws_ecs_service.data["supplier-db"]
}

moved {
  from = aws_ecs_service.service["credit-db"]
  to   = aws_ecs_service.data["credit-db"]
}

moved {
  from = aws_ecs_service.service["order-db"]
  to   = aws_ecs_service.data["order-db"]
}

moved {
  from = aws_ecs_service.service["user-redis"]
  to   = aws_ecs_service.data["user-redis"]
}

moved {
  from = aws_ecs_service.service["kafka"]
  to   = aws_ecs_service.data["kafka"]
}

moved {
  from = aws_ecs_service.service["mailpit"]
  to   = aws_ecs_service.data["mailpit"]
}

moved {
  from = aws_ecs_service.service["user-service"]
  to   = aws_ecs_service.app["user-service"]
}

moved {
  from = aws_ecs_service.service["supplier-service"]
  to   = aws_ecs_service.app["supplier-service"]
}

moved {
  from = aws_ecs_service.service["credit-service"]
  to   = aws_ecs_service.app["credit-service"]
}

moved {
  from = aws_ecs_service.service["order-service"]
  to   = aws_ecs_service.app["order-service"]
}

moved {
  from = aws_ecs_service.service["api-gateway"]
  to   = aws_ecs_service.edge["api-gateway"]
}

moved {
  from = aws_ecs_service.service["frontend"]
  to   = aws_ecs_service.edge["frontend"]
}

