# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 1).
# Author review: Pending Jian Bing's review.

# One stack per account (staging and production share the NUS-managed account, spec §6). It keeps
# local state because it creates the bucket every other stack stores its state in.

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  images     = ["user-service", "supplier-service", "credit-service", "order-service", "api-gateway", "frontend", "kafka-init"]

  # Who may assume each GitHub role: the OIDC token's "sub" claim.
  github_roles = {
    "plan"              = "repo:${var.github_repo}:pull_request"
    "deploy-staging"    = "repo:${var.github_repo}:ref:refs/heads/main"
    "deploy-production" = "repo:${var.github_repo}:environment:production"
  }
}

# --- Terraform state ---------------------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = "foc-terraform-state-${local.account_id}"
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Images: built once, promoted from staging to production -----------------------------------

resource "aws_ecr_repository" "service" {
  for_each             = toset(local.images)
  name                 = "foc/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- GitHub Actions roles (OIDC: no long-lived AWS keys in GitHub) ------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github" {
  for_each = local.github_roles
  name     = "foc-github-${each.key}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = each.value
        }
      }
    }]
  })
}

# Pull requests only run "terraform plan": read infrastructure, never secret values, and write
# nothing but the two environments' state lock files. (Fork pull requests get no OIDC token.)
resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.github["plan"].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_state_lock" {
  name = "terraform-state-lock"
  role = aws_iam_role.github["plan"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = [for env in ["staging", "production"] : "${aws_s3_bucket.state.arn}/${env}/terraform.tfstate.tflock"]
      },
      {
        # ReadOnlyAccess would otherwise let a pull request read our SecureStrings. Only /foc/ is
        # denied: plan still reads AWS's public parameters (the ECS-optimised AMI ID).
        Effect   = "Deny"
        Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath", "ssm:GetParameterHistory"]
        Resource = "arn:aws:ssm:*:${local.account_id}:parameter/foc/*"
      },
      { Effect = "Deny", Action = ["secretsmanager:GetSecretValue", "kms:Decrypt"], Resource = "*" },
    ]
  })
}

# Deploy roles push images and roll ECS services; they never change infrastructure (humans run
# "terraform apply"). Each touches only its own environment's cluster, services and task roles.
resource "aws_iam_role_policy" "deploy" {
  for_each = { for k in ["deploy-staging", "deploy-production"] : k => trimprefix(k, "deploy-") }
  name     = "deploy"
  role     = aws_iam_role.github[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
          "ecr:DescribeImages", "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload",
          "ecr:PutImage", "ecr:UploadLayerPart",
        ]
        Resource = [for r in aws_ecr_repository.service : r.arn]
      },
      # Read-only calls and RegisterTaskDefinition don't support resource-level permissions.
      { Effect = "Allow", Action = ["ecs:Describe*", "ecs:List*", "ecs:RegisterTaskDefinition"], Resource = "*" },
      {
        Effect   = "Allow"
        Action   = "ecs:UpdateService"
        Resource = "arn:aws:ecs:ap-southeast-1:${local.account_id}:service/foc-${each.value}/*"
      },
      {
        Effect    = "Allow"
        Action    = "ecs:RunTask"
        Resource  = "arn:aws:ecs:ap-southeast-1:${local.account_id}:task-definition/foc-${each.value}-*:*"
        Condition = { ArnEquals = { "ecs:cluster" = "arn:aws:ecs:ap-southeast-1:${local.account_id}:cluster/foc-${each.value}" } }
      },
      {
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = "arn:aws:iam::${local.account_id}:role/foc-${each.value}-*"
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
    ]
  })
}

# --- Budget: created before anything that costs money -----------------------------------------

resource "aws_budgets_budget" "monthly" {
  name         = "foc-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.budget_emails
    }
  }
}
