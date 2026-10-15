#!/bin/sh
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Generated the topic creation run by kafka-init (spec §9.2, decisions K9–K10).
# Author review: pending — Jian Bing to record what he checked.
#
# Creates every topic in topics.txt, then Credit's retry topics. Safe to run again: existing topics
# are left alone.
set -eu

BOOTSTRAP=kafka:9092

create() {
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$1" --partitions "$2" --replication-factor 1
}

# Skip comments and blank lines; read from a file (not a pipe) so a failure stops the script.
grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' /topics.txt > /tmp/topics
while read -r name partitions; do
  create "$name" "$partitions"
done < /tmp/topics

# One retry topic per delay, so their number always matches what the Credit Service expects.
i=0
for _delay in $(echo "$CREDIT_RETRY_DELAYS" | tr ',' ' '); do
  create "credit.commands.retry.$i" 1
  i=$((i + 1))
done
