<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Wrote this README for the shared Kafka setup.
Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: topics.txt is the one list, retry topics included (K10 revised); how to retire a retry
delay safely (PR #85 review).
Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
Author review: Jian Bing supplied what it states; the wording is Claude's.
-->

# Kafka (shared message broker)

One KRaft broker for every service (redesign spec §9; rules in root `AGENTS.md` §3 "Messaging").
Started by the root `docker compose up`; only Kafka: `docker compose up -d kafka kafka-init kafka-ui`.

| What | Where |
|---|---|
| Broker, from containers | `kafka:9092` |
| Broker, from the host | `localhost:9094` |
| Kafka UI | http://localhost:8085 |

**Topics** are never auto-created. `topics.txt` is the one list of every topic, Credit's retry topics
included, and `kafka-init` creates exactly those. To add a topic, add a line to `topics.txt` and run
`docker compose up kafka-init`. Credit's retry topics must match `CREDIT_RETRY_DELAYS` (one per
delay); the Credit Service refuses to start, saying what to fix, if they don't.

**Removing a retry delay** (e.g. shortening `CREDIT_RETRY_DELAYS` from five delays to four) can
strand commands still waiting in the retired topic, so drain it first:
1. Wait until the retiring topic (`credit.commands.retry.4` here) is empty: in Kafka UI its
   `credit-service` consumer lag is 0, and no new messages arrived in the last retry window.
2. Then, together: remove the delay from `CREDIT_RETRY_DELAYS`, remove the line from `topics.txt`,
   and delete the topic (`kafka-topics.sh --delete`). Restart the Credit Service.

Adding a delay needs no draining: add the line to `topics.txt`, run `kafka-init`, then add the delay.

**Local only:** one broker, no authentication, replication factor 1 (losing the volume loses the
messages). The cloud needs a managed Kafka (e.g. Amazon MSK) or a private, authenticated broker (#58).
