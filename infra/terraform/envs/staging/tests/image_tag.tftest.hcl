# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Deploy part 3 (#143): a manual apply keeps the tag CD last deployed. Mocked AWS provider.
# Author review: Pending Jian Bing's review.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
  mock_data "aws_region" {
    defaults = { region = "ap-southeast-1" }
  }
}

override_data {
  target = data.aws_ssm_parameter.image_tag[0]
  values = { insecure_value = "abc1234" }
}

variables {
  env              = "staging"
  alert_emails     = ["team@example.com"]
  mailpit_relay_to = []
}

run "image_tag_from_parameter" {
  command = plan

  assert {
    condition     = local.image_tag == "abc1234"
    error_message = "With no -var image_tag, the stack keeps the tag CD recorded."
  }
}

run "image_tag_from_variable" {
  command = plan
  variables {
    image_tag = "def5678"
  }

  assert {
    condition     = local.image_tag == "def5678" && length(data.aws_ssm_parameter.image_tag) == 0
    error_message = "An explicit image_tag wins, and the parameter isn't read."
  }
}
