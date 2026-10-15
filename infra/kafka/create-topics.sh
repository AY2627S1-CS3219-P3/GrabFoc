#!/bin/sh
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Generated the topic creation run by kafka-init (spec §9.2, decisions K9–K10).
# Author review: pending — Jian Bing to record what he checked.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
# Scope: Removed the retry-topic generation; topics.txt lists them (K10 revised).
# Author review: pending — Jian Bing to record what he checked.
#
# Creates every topic in topics.txt, the one list of topics. Safe to run again: existing topics
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
