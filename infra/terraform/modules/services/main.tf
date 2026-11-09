# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 5).
# Author review (Jian Bing, 2026-11-06): Went through it with Claude Code's walkthrough and understood it; ran
#   infra/terraform/check.sh (every stack valid, all tests passed) and checked staging (the locations list and
#   the admin locations page load).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
# Scope: Gateway edge-listener settings (GATEWAY_EDGE_PORT, FRONTEND_URL); the frontend in its own layer after the gateway (deploy part 1, #141).
# Author review (Jian Bing, 2026-11-07): Looked through the code and think it's okay.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
# Scope: Comment on the layers: the app services also need the one-off first-apply restart (Codex review on #146).
# Author review: Pending Jian Bing's review.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Deploy part 3 (#143): Mailpit's allowlist and API port, the checks task, the Notification Service,
#        and a health check for the gateway (deploy-images.sh waits for HEALTHY).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
# Scope: AZ rebalancing off on every service (the staging dry run failed on Mailpit's 100% maximum).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
# Scope: ORDER_CHAT_TICKET_SECRET for Order and CHAT_SERVICE_URL for the gateway, which chat (#230) requires.
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
# Scope: The Logging Service and its database, LOGGING_SERVICE_URL for the gateway, and the broker
#        address Supplier was missing, so its lines reach the store too (issue #52).
# Author review: pending - Jian Bing owns the deployment.
# Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
# Scope: Review: the app services stop before being replaced, and a memory model for the rollout
#        peak rather than the steady state - six app tasks doubling at once did not fit the server.
# Author review: pending - Jian Bing owns the deployment.
# Every container from the compose files as an ECS service on the environment's one server (spec
# §3.1, §4, §5). Values match the compose files; anything secret comes from SSM /foc/<env>/<NAME>.
# AI-generated (Claude Code).

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  region     = data.aws_region.current.region
  ssm_prefix = "arn:aws:ssm:${local.region}:${data.aws_caller_identity.current.account_id}:parameter/foc/${var.env}"
  image      = { for name, url in var.ecr_repository_urls : name => "${url}:${var.image_tag}" }

  # Mail: production sends straight to Gmail; staging sends to Mailpit, which keeps a copy and relays
  # to Gmail only the recipients on mailpit_relay_to (spec §6).
  smtp = var.mailpit_relay ? { host = "mailpit", port = "1025" } : { host = "smtp.gmail.com", port = "587" }

  postgres = {
    for name, cfg in {
      # AI-generated (Claude Code).
      "user-db"         = { db = "users", password = "POSTGRES_PASSWORD" }
      "supplier-db"     = { db = "supplier", password = "SUPPLIER_POSTGRES_PASSWORD" }
      "credit-db"       = { db = "credit", password = "CREDIT_POSTGRES_PASSWORD" }
      "order-db"        = { db = "orders", password = "ORDER_DB_PASSWORD" }
      "notification-db" = { db = "notification", password = "NOTIFICATION_POSTGRES_PASSWORD" }
      # AI-generated (Claude Code): the log store (issue #52).
      "logging-db" = { db = "logging", password = "LOGGING_POSTGRES_PASSWORD" }
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
        USER_INTERNAL_SERVICE_KEY  = "USER_INTERNAL_SERVICE_KEY"
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
        # AI-generated (Claude Code): without it this service's log lines only ever reach its own
        # stdout, so a deployed request that touched Supplier shows a gap in the store where the
        # other four services have a row (issue #52).
        SUPPLIER_KAFKA_BROKERS = "kafka:9092"
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
        # AI-generated (Claude Code): Order won't start without it since chat (#230);
        # the chat service will read the same parameter.
        ORDER_CHAT_TICKET_SECRET = "CHAT_TICKET_SECRET"
      }
    }
    # AI-generated (Claude Code).
    "notification-service" = {
      image  = local.image["notification-service"]
      port   = 3006
      health = local.listening[3006]
      memory = 192
      env    = local.notification_env
      secrets = {
        PGPASSWORD                    = "NOTIFICATION_POSTGRES_PASSWORD" # as in compose: not in the URL
        NOTIFICATION_SMTP_USER        = "USER_SMTP_USER"
        NOTIFICATION_SMTP_PASS        = "USER_SMTP_PASS"
        NOTIFICATION_SMTP_FROM        = "USER_SMTP_FROM"
        NOTIFICATION_USER_SERVICE_KEY = "USER_INTERNAL_SERVICE_KEY"
      }
    }
    # AI-generated (Claude Code): the log store (issue #52). Port 3006 inside its own container, the
    # same as Notification's: in bridge mode nothing binds it on the server, and Service Connect
    # addresses a service by name, so the two never collide. (The repo's compose files publish 3006
    # and 3007 on a laptop only because a host port can be bound once.)
    "logging-service" = {
      image  = local.image["logging-service"]
      port   = 3006
      health = local.listening[3006]
      memory = 192
      env    = local.logging_env
      # The whole URL, as for User and Supplier: this service reads one connection string and the
      # password cannot be passed beside it.
      secrets = { LOGGING_DATABASE_URL = "LOGGING_DATABASE_URL" }
    }
    "api-gateway" = {
      image     = local.image["api-gateway"]
      port      = 3003
      host_port = 80 # the only port the server publishes; CloudFront's origin
      memory    = 96
      # Envoy answers /health itself on the internal listener; the image has python3 for render.py.
      health = ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3003/health', timeout=4)"]
      env = merge({
        GATEWAY_PORT         = "3003"
        USER_SERVICE_URL     = "http://user-service:3001"
        SUPPLIER_SERVICE_URL = "http://supplier-service:3002"
        ORDER_SERVICE_URL    = "http://order-service:3005"
        CREDIT_SERVICE_URL   = "http://credit-service:3004"
        FRONTEND_URL         = "http://frontend:3000" # the edge listener's catch-all (deploy part 1)
        # AI-generated (Claude Code): chat's route file (#230) needs it or the gateway
        # won't start. The chat service isn't on AWS yet, so chat requests get 503 until it is.
        CHAT_SERVICE_URL = "http://chat-service:3007"
        # AI-generated (Claude Code): the log store's route file (issue #52) needs it or the
        # gateway won't start, the same rule as chat's above.
        LOGGING_SERVICE_URL = "http://logging-service:3006"
        }, var.edge_container_port == 3003 ? {} : {
        GATEWAY_EDGE_PORT = tostring(var.edge_container_port)
      })
      # CloudFront's X-Origin-Key value; the edge listener rejects requests without it.
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
      # AI-generated (Claude Code).
      # The API, for the checks task; the security group keeps it off the internet.
      extra_ports = [8025]
      memory      = 48
      env         = local.mailpit_env
      secrets = {
        # Only the User and Notification Services know this login ("<USER_SMTP_USER>:<USER_SMTP_PASS>",
        # the credentials they already send), so no other container can relay through the Gmail account.
        MP_SMTP_AUTH           = "MAILPIT_SMTP_AUTH"
        MP_SMTP_RELAY_USERNAME = "USER_SMTP_USER"
        MP_SMTP_RELAY_PASSWORD = "USER_SMTP_PASS"
      }
    }
  } : {})

  # AI-generated (Claude Code).
  # Without a list, Mailpit relays nothing: the checks sign up random addresses at a real domain.
  mailpit_env = merge({
    MP_SMTP_AUTH_ALLOW_INSECURE = "true" # plain login over the server's internal network
    MP_SMTP_RELAY_HOST          = "smtp.gmail.com"
    MP_SMTP_RELAY_PORT          = "587"
    MP_SMTP_RELAY_STARTTLS      = "true"
    MP_SMTP_RELAY_AUTH          = "login"
    }, length(var.mailpit_relay_to) == 0 ? {} : {
    MP_SMTP_RELAY_MATCHING = "^(${join("|", [for a in var.mailpit_relay_to : replace(a, "/[.+]/", "\\$0")])})$"
  })

  # Values match notification-service/compose.yaml.
  notification_env = {
    NOTIFICATION_PORT          = "3006"
    NOTIFICATION_DATABASE_URL  = "postgres://foc@notification-db:5432/notification" # password from PGPASSWORD
    NOTIFICATION_KAFKA_BROKERS = "kafka:9092"
    NOTIFICATION_RETRY_DELAYS  = "1s,5s,30s,2m,10m"
    NOTIFICATION_SMTP_HOST     = local.smtp.host
    NOTIFICATION_SMTP_PORT     = local.smtp.port
    NOTIFICATION_USER_URL      = "http://user-service:3001"
    NOTIFICATION_FRONTEND_URL  = var.public_url
  }

  # AI-generated (Claude Code).
  # Values match logging-service/compose.yaml, except the database URL, which is a secret: it
  # carries the password. Retention and the purge interval are the service's own defaults, written
  # out here so the deployed value is visible rather than implied.
  logging_env = {
    LOGGING_PORT                   = "3006"
    LOGGING_JWKS_URL               = "http://user-service:3001/.well-known/jwks.json"
    LOGGING_KAFKA_BROKERS          = "kafka:9092"
    LOGGING_KAFKA_TOPIC            = "logging.lines"
    LOGGING_KAFKA_GROUP_ID         = "logging-service"
    LOGGING_KAFKA_DLT_TOPIC        = "logging.lines.dlt"
    LOGGING_RETENTION_DAYS         = "30"
    LOGGING_PURGE_INTERVAL_MINUTES = "60"
  }

  # Node services: healthy once something listens on the port (catches a start-up that hangs).
  listening = {
    for port in [3000, 3001, 3002, 3004, 3005, 3006] : port => [
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

  # AI-generated (Claude Code).
  # Staging's on-demand checks (infra/scripts/run-checks.sh). A standalone task gets no Service
  # Connect names, so it uses the public URL, and Mailpit through the server's Docker bridge address.
  checks = var.mailpit_relay ? {
    "checks" = {
      image   = local.image["checks"]
      memory  = 256
      env     = { BASE_URL = "${var.public_url}/gateway", MAILPIT_URL = "http://172.17.0.1:8025" }
      secrets = {}
    }
  } : {}

  # Environment variable names that carry secrets, and the SSM names they come from.
  secret_names = distinct(flatten([for c in merge(local.containers, local.oneoffs) : concat(keys(c.secrets), values(c.secrets))]))

  init_containers = {
    # AI-generated (Claude Code).
    "order-service"        = ["kafka-init", "order-migrate"]
    "credit-service"       = ["kafka-init"]
    "notification-service" = ["kafka-init"]
    # AI-generated (Claude Code): its topic and dead-letter topic are created there, and
    # KAFKA_AUTO_CREATE_TOPICS_ENABLE is false (issue #52).
    "logging-service" = ["kafka-init"]
  }

  # Everything except the frontend. The data stores and the gateway are here because two copies
  # must never share a folder or a host port; the app services are here for memory (review).
  #
  # deploy-images.sh updates all of the app layer and then waits, so rolling them would put six
  # second copies on the server at once - 2,304 MiB of reservations on top of everything already
  # running, which does not fit beside the injected Service Connect proxies (local.memory_at_peak
  # below). And it buys nothing: api-gateway stops before being replaced, so every deploy already
  # has a gap at the one public entry point, and a service rolled smoothly behind a gateway that is
  # about to stop is still unreachable. The cost is that each app service is down for a few seconds
  # during its own replacement, which the gateway answers as a 503.
  #
  # The alternative, if that gap ever matters, is to roll the app layer one service at a time in
  # deploy-images.sh: then only one duplicate exists at a time and the peak stays low too.
  stops_before_replacing = toset([
    "user-db", "supplier-db", "credit-db", "order-db", "notification-db", "logging-db",
    "user-redis", "kafka", "mailpit", "api-gateway",
    "user-service", "supplier-service", "credit-service", "order-service", "notification-service",
    "logging-service",
  ])
}

# --- Shared plumbing -------------------------------------------------------------------------------

resource "aws_service_discovery_http_namespace" "this" {
  name = "foc-${var.env}" # Service Connect: containers keep their compose names
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = merge(local.containers, local.oneoffs, local.checks)
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
    for name, c in merge(local.containers, local.oneoffs, local.checks) : name => merge(
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
            # With edge_container_port 3003 (no edge listener), the public port 80 maps to this same port.
            try(c.host_port, null) != null && var.edge_container_port == c.port ? { hostPort = c.host_port } : {},
          )],
          try(c.host_port, null) != null && var.edge_container_port != c.port ? [
            { name = "edge", containerPort = var.edge_container_port, hostPort = c.host_port, protocol = "tcp" }
          ] : [],
          [for p in try(c.extra_ports, []) : { name = "${name}-${p}", containerPort = p, hostPort = p, protocol = "tcp" }],
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

# AI-generated (Claude Code).
# No ECS service: run-checks.sh starts it after each staging deploy.
resource "aws_ecs_task_definition" "checks" {
  count                    = length(local.checks)
  family                   = "foc-${var.env}-checks"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.execution.arn
  container_definitions    = jsonencode([local.container_definition["checks"]])
}

# --- Services ----------------------------------------------------------------------------------------

# Created in three layers: a Service Connect client only learns the names that already existed when
# its deployment was created (first live apply, 2026-10-26). Data stores first, then the apps that
# use them, then Envoy, then the frontend (which calls Envoy). Two kinds of call can't be ordered
# this way: the app services call each other (User and Order each call the other), and Envoy also
# calls the frontend. So on an environment's very first apply, the app services and api-gateway are
# restarted once afterwards (infra/terraform/README.md, step 4).
#
# ECS has no depends_on between running services: a service whose database or Kafka isn't up yet
# exits (or fails its health check) and is restarted until it is. A circuit breaker would stop
# those restarts, so it stays off. Data stores (one folder each) and the gateway (host port 80)
# stop before their replacement starts; the rest roll with a brief overlap.
locals {
  layer = {
    data = toset(["user-db", "supplier-db", "credit-db", "order-db", "notification-db", "logging-db", "user-redis", "kafka", "mailpit"])
    app  = toset(["user-service", "supplier-service", "credit-service", "order-service", "notification-service", "logging-service"])
    edge = toset(["api-gateway"])
    web  = toset(["frontend"])
  }
  ecs_services = merge(aws_ecs_service.data, aws_ecs_service.app, aws_ecs_service.edge, aws_ecs_service.web)

  # AI-generated (Claude Code).
  # What ECS places against this environment's one server, in MiB (review). Reservations are what
  # placement counts, and a task's one-shot init containers are reserved while they run, so they
  # count as part of that task.
  #
  # The steady state is not the number to check. deploy-images.sh rolls one layer and waits for it
  # before the next, so at most one layer is ever replacing - but inside a layer every service is
  # updated at once, and one that does not stop before being replaced has a second copy running
  # beside the first. So the peak is everything running, plus the duplicates of whichever layer
  # doubles the most, plus a Service Connect proxy for every task including the duplicates. AWS
  # asks for at least 64 MiB per proxy, and the task definitions do not reserve it, so it is added
  # here rather than left out of the sum.
  task_memory = {
    for name, c in local.containers : name =>
    c.memory + sum(concat([0], [for i in lookup(local.init_containers, name, []) : local.oneoffs[i].memory]))
  }
  proxy_memory  = 64
  memory_steady = sum([for name in keys(local.containers) : local.task_memory[name]])
  rolling = {
    for name, names in local.layer : name => [
      for service in names : service
      if contains(keys(local.containers), service) && !contains(local.stops_before_replacing, service)
    ]
  }
  memory_at_peak = max([
    for name, services in local.rolling :
    local.memory_steady
    + sum(concat([0], [for service in services : local.task_memory[service]]))
    + local.proxy_memory * (length(local.containers) + length(services))
  ]...)
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
  # One server in one zone: nothing to rebalance, and ECS refuses a 100% maximum while it is on.
  availability_zone_rebalancing = "DISABLED" # AI-generated (Claude Code)

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
  # One server in one zone: nothing to rebalance, and ECS refuses a 100% maximum while it is on.
  availability_zone_rebalancing = "DISABLED" # AI-generated (Claude Code)

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
  # One server in one zone: nothing to rebalance, and ECS refuses a 100% maximum while it is on.
  availability_zone_rebalancing = "DISABLED" # AI-generated (Claude Code)

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

resource "aws_ecs_service" "web" {
  for_each        = { for k, v in local.containers : k => v if contains(local.layer.web, k) }
  name            = each.key
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = 1

  depends_on = [aws_ecs_service.edge]

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
  # One server in one zone: nothing to rebalance, and ECS refuses a 100% maximum while it is on.
  availability_zone_rebalancing = "DISABLED" # AI-generated (Claude Code)

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

# Deploy part 1: the frontend moved to its own layer after the gateway.
moved {
  from = aws_ecs_service.edge["frontend"]
  to   = aws_ecs_service.web["frontend"]
}
