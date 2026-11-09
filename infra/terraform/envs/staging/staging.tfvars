# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
# Scope: instance_type t3.xlarge for staging (Jian Bing's choice after the deploy part 3 dry run).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# AI-generated (Claude Code).
env = "staging"

# Rolling the five app services at once kept a t3.large's 2 CPUs at 100% for half an hour and
# Kafka failed its health checks (deploy part 3 dry run, 2026-11-08). 4 CPUs, 16 GB.
instance_type = "t3.xlarge"
