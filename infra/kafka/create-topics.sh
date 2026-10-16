#!/bin/sh
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Generated the topic creation run by kafka-init (spec §9.2, decisions K9–K10).
# Author review: pending — Jian Bing to record what he checked.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
# Scope: Removed the retry-topic generation; topics.txt lists them (K10 revised). Raise an
#   existing topic's partitions to the listed count (PR #84 review).
# Author review: pending — Jian Bing to record what he checked.
#
# Creates every topic in topics.txt, the one list of topics. Safe to run again: existing topics
# are left alone.
set -eu

BOOTSTRAP=kafka:9092

TOPICS=/opt/kafka/bin/kafka-topics.sh

# Creates the topic, or raises an existing topic's partitions to the listed count. Kafka can't
# lower a count, so a smaller number only warns. Raising one moves keys to new partitions, so
# messages for one key may briefly be read out of order: do it when the topic is quiet.
create() {
  "$TOPICS" --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$1" --partitions "$2" --replication-factor 1
  current=$("$TOPICS" --bootstrap-server "$BOOTSTRAP" --describe --topic "$1" \
    | sed -n 's/.*PartitionCount: *\([0-9][0-9]*\).*/\1/p' | head -n 1)
  if [ "$current" -lt "$2" ]; then
    "$TOPICS" --bootstrap-server "$BOOTSTRAP" --alter --topic "$1" --partitions "$2"
    echo "Raised $1 from $current to $2 partitions."
  elif [ "$current" -gt "$2" ]; then
    echo "WARNING: $1 has $current partitions but topics.txt lists $2; Kafka can't lower it." >&2
  fi
}

# Skip comments and blank lines; read from a file (not a pipe) so a failure stops the script.
grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' /topics.txt > /tmp/topics
while read -r name partitions; do
  create "$name" "$partitions"
done < /tmp/topics
