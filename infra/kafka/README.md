<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Wrote this README for the shared Kafka setup.
Author review: pending — Jian Bing to record what he checked.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: topics.txt is the one list, retry topics included (K10 revised).
Author review: pending — Jian Bing to record what he checked.
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

**Local only:** one broker, no authentication, replication factor 1 (losing the volume loses the
messages). The cloud needs a managed Kafka (e.g. Amazon MSK) or a private, authenticated broker (#58).
