# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (Task 1). Runs with a mocked AWS provider: no credentials needed.
# Author review: Pending Jian Bing's review.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
}

variables {
  monthly_budget_usd = 50
  budget_emails      = ["team@example.com"]
}

run "global" {
  command = apply

  assert {
    condition     = aws_s3_bucket.state.bucket == "foc-terraform-state-111122223333"
    error_message = "State bucket must be named foc-terraform-state-<account_id>."
  }
  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "State bucket versioning must be enabled."
  }
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "State bucket must block all public access."
  }
  assert {
    condition = length(aws_ecr_repository.service) == 7 && alltrue([
      for r in aws_ecr_repository.service : r.image_tag_mutability == "IMMUTABLE"
    ])
    error_message = "Seven immutable ECR repositories expected."
  }
  assert {
    condition = toset(keys(output.ecr_repository_urls)) == toset([
      "user-service", "supplier-service", "credit-service", "order-service", "api-gateway", "frontend", "kafka-init",
    ])
    error_message = "ecr_repository_urls must be keyed by the seven image names."
  }
  assert {
    condition     = jsondecode(aws_iam_role.github["deploy-production"].assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:AY2627S1-CS3219-P3/GrabFoc:environment:production"
    error_message = "Production deploy role must trust only the production environment."
  }
  assert {
    condition     = jsondecode(aws_iam_role.github["deploy-staging"].assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:AY2627S1-CS3219-P3/GrabFoc:ref:refs/heads/main"
    error_message = "Staging deploy role must trust only main."
  }
  assert {
    condition     = jsondecode(aws_iam_role.github["plan"].assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:AY2627S1-CS3219-P3/GrabFoc:pull_request"
    error_message = "Plan role must trust pull requests."
  }
  assert {
    condition     = aws_iam_role_policy_attachment.plan_read_only.policy_arn == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    error_message = "Plan role must be read-only."
  }
  assert {
    condition     = toset(keys(output.github_role_arns)) == toset(["plan", "deploy-staging", "deploy-production"])
    error_message = "github_role_arns must list the three roles."
  }
  assert {
    condition = aws_budgets_budget.monthly.limit_amount == "50" && toset([
      for n in aws_budgets_budget.monthly.notification : n.threshold
    ]) == toset([50, 80, 100])
    error_message = "Monthly budget must alert at 50/80/100 % of var.monthly_budget_usd."
  }
}

# Security review (2026-10-25): each role holds only what its environment needs.
run "least_privilege" {
  command = apply

  assert {
    condition = alltrue([
      for env in ["staging", "production"] : alltrue([
        for s in jsondecode(aws_iam_role_policy.deploy["deploy-${env}"].policy).Statement :
        contains(flatten([s.Action]), "ecs:UpdateService") ? s.Resource == "arn:aws:ecs:ap-southeast-1:111122223333:service/foc-${env}/*" : true
      ])
    ])
    error_message = "A deploy role may update only its own environment's ECS services."
  }
  assert {
    condition = alltrue([
      for env in ["staging", "production"] : anytrue([
        for s in jsondecode(aws_iam_role_policy.deploy["deploy-${env}"].policy).Statement :
        contains(flatten([s.Action]), "ecs:RunTask") && try(s.Condition.ArnEquals["ecs:cluster"], "") == "arn:aws:ecs:ap-southeast-1:111122223333:cluster/foc-${env}"
      ])
    ])
    error_message = "A deploy role may run tasks only on its own environment's cluster."
  }
  assert {
    condition = alltrue([
      for env in ["staging", "production"] : anytrue([
        for s in jsondecode(aws_iam_role_policy.deploy["deploy-${env}"].policy).Statement :
        s.Action == "iam:PassRole" && try(s.Condition.StringEquals["iam:PassedToService"], "") == "ecs-tasks.amazonaws.com"
      ])
    ])
    error_message = "PassRole must be limited to ECS tasks."
  }
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.plan_state_lock.policy).Statement :
      s.Effect == "Deny" && contains(s.Action, "ssm:GetParameter")
      ]) && anytrue([
      for s in jsondecode(aws_iam_role_policy.plan_state_lock.policy).Statement :
      s.Effect == "Deny" && contains(s.Action, "kms:Decrypt")
    ])
    error_message = "The pull-request plan role must be denied secret values."
  }
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.plan_state_lock.policy).Statement :
      s.Effect == "Allow" && toset(flatten([s.Resource])) == toset([
        "${aws_s3_bucket.state.arn}/staging/terraform.tfstate.tflock",
        "${aws_s3_bucket.state.arn}/production/terraform.tfstate.tflock",
      ])
    ])
    error_message = "The plan role may write only the two environments' lock files."
  }
}

# Final review, Important 7: the Deny must not block the public ECS AMI parameter that plan reads.
run "plan_can_read_public_parameters" {
  command = apply

  assert {
    condition = alltrue([
      for st in jsondecode(aws_iam_role_policy.plan_state_lock.policy).Statement :
      st.Effect != "Deny" || !contains(st.Action, "ssm:GetParameter") || st.Resource == "arn:aws:ssm:*:111122223333:parameter/foc/*"
    ])
    error_message = "Deny SSM reads only under /foc/, not on every parameter."
  }
}
