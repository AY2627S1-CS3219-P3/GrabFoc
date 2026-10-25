# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 1).
# Author review: Pending Jian Bing's review.

variable "github_repo" {
  description = "GitHub repository whose Actions may assume the roles."
  type        = string
  default     = "AY2627S1-CS3219-P3/GrabFoc"
}

variable "monthly_budget_usd" {
  description = "Monthly AWS spend that triggers the budget alerts."
  type        = number
}

variable "budget_emails" {
  description = "Addresses that receive the budget alerts."
  type        = list(string)
}
