# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
# Scope: instance_type t3.xlarge for production (Jian Bing's choice when creating production).
# Author review: Pending Jian Bing's review.
# AI-generated (Claude Code).
env = "production"

# Same as staging. On a t3.large the deploy peak is 6,880 MiB of the ~7,000 MiB containers can
# get (local.memory_at_peak), and staging's t3.large starved Kafka of CPU during deploys. 4 CPUs, 16 GB.
instance_type = "t3.xlarge"
