#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Task 4): tests run-checks.sh.
# Author review: Pending Jian Bing's review.
#
# Run: infra/scripts/test/run-checks.test.sh   (no AWS access needed; needs jq)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../run-checks.sh"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
# Fake aws. FAKE_EXIT: the container's exit code ("none" if it never ran). FAKE_NO_START: run-task places nothing.
cat > "$work/bin/aws" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$AWS_CALLS"
arg() { local want="$1"; shift; while [ $# -gt 0 ]; do [ "$1" = "$want" ] && { echo "$2"; return; }; shift; done; }
case "$*" in
  ecs\ describe-task-definition*)
    echo '{"taskDefinitionArn":"arn","revision":1,"family":"foc-staging-checks","containerDefinitions":[{"name":"checks","image":"1.dkr.ecr.ap-southeast-1.amazonaws.com/foc/checks:old0000"}]}' ;;
  ecs\ register-task-definition*)
    file=$(arg --cli-input-json "$@"); cp "${file#file://}" "$AWS_CALLS.registered.json"
    echo "arn:aws:ecs:ap-southeast-1:1:task-definition/foc-staging-checks:2" ;;
  ecs\ run-task*)
    if [ -n "${FAKE_NO_START:-}" ]; then
      echo '{"tasks":[],"failures":[{"reason":"RESOURCE:MEMORY"}]}'
    else
      echo '{"tasks":[{"taskArn":"arn:aws:ecs:ap-southeast-1:1:task/foc-staging/abc123"}],"failures":[]}'
    fi ;;
  ecs\ wait*) [ -z "${FAKE_WAIT_FAIL:-}" ] || exit 255 ;;
  ecs\ describe-tasks*)
    if [ "${FAKE_EXIT:-0}" = none ]; then
      echo '{"tasks":[{"stoppedReason":"CannotPullContainerError","containers":[{"name":"checks"}]}]}'
    else
      echo "{\"tasks\":[{\"stoppedReason\":\"Essential container in task exited\",\"containers\":[{\"name\":\"checks\",\"exitCode\":${FAKE_EXIT:-0}}]}]}"
    fi ;;
  logs\ tail*) echo "newman output line"; [ -z "${FAKE_LOGS_FAIL:-}" ] || exit 1 ;;
esac
FAKE
chmod +x "$work/bin/aws"
export PATH="$work/bin:$PATH" AWS_CALLS="$work/calls"
passed() { grep -q "put-parameter .*--name /foc-deploy/staging/passed-tag .*--value abc1234" "$AWS_CALLS"; }

: > "$AWS_CALLS"
out=$("$SCRIPT" staging abc1234 2>&1); code=$?
check "pass writes passed-tag" '[ $code -eq 0 ] && passed'
check "runs the checks image with the tag under test" '[ "$(jq -r ".containerDefinitions[0].image" "$AWS_CALLS.registered.json")" = "1.dkr.ecr.ap-southeast-1.amazonaws.com/foc/checks:abc1234" ]'
check "runs the revision it registered" 'grep -q "run-task .*--task-definition arn:aws:ecs:ap-southeast-1:1:task-definition/foc-staging-checks:2" "$AWS_CALLS"'
check "logs are printed" 'grep -q "newman output line" <<<"$out"'
check "logs come from this run only" 'grep -q "logs tail /foc/staging/checks .*--log-stream-name-prefix checks/checks/abc123" "$AWS_CALLS"'
check "every call pins the region" '[ "$(grep -vc -- "--region ap-southeast-1" "$AWS_CALLS")" = 0 ]'

: > "$AWS_CALLS"
out=$(FAKE_EXIT=1 "$SCRIPT" staging abc1234 2>&1); code=$?
check "newman failure fails the run" '[ $code -eq 1 ]'
check "newman failure writes no passed-tag" '! passed'
check "newman failure still prints the logs" 'grep -q "newman output line" <<<"$out"'

: > "$AWS_CALLS"
out=$(FAKE_NO_START=1 "$SCRIPT" staging abc1234 2>&1); code=$?
check "task that never starts fails" '[ $code -ne 0 ] && ! passed'
check "says why it didn't start" 'grep -q "RESOURCE:MEMORY" <<<"$out"'

: > "$AWS_CALLS"
out=$(FAKE_EXIT=none "$SCRIPT" staging abc1234 2>&1); code=$?
check "container that never ran fails" '[ $code -ne 0 ] && ! passed'
check "says why it stopped" 'grep -q "CannotPullContainerError" <<<"$out"'

: > "$AWS_CALLS"
out=$(FAKE_WAIT_FAIL=1 "$SCRIPT" staging abc1234 2>&1); code=$?
check "task that never stops fails" '[ $code -ne 0 ] && ! passed'

: > "$AWS_CALLS"
out=$(FAKE_LOGS_FAIL=1 "$SCRIPT" staging abc1234 2>&1); code=$?
check "a log read that fails doesn't change the result" '[ $code -eq 0 ] && passed'

: > "$AWS_CALLS"
"$SCRIPT" production abc1234 > /dev/null 2>&1; code=$?
check "staging only" '[ $code -ne 0 ] && [ ! -s "$AWS_CALLS" ]'
"$SCRIPT" staging > /dev/null 2>&1; code=$?
check "rejects a missing tag" '[ $code -ne 0 ] && [ ! -s "$AWS_CALLS" ]'

echo "$fails failed"
[ "$fails" -eq 0 ]
