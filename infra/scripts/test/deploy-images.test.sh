#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Task 3): tests deploy-images.sh.
#        Final review fixes: failed registers, missing services, health after the rollout.
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-06
# Scope: Tests that every foc/ image is checked on the tag first, and a missing one stops the deploy.
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
# Scope: Expects chat-service in the app layer (chat on AWS).
# Author review: Pending Jian Bing's review.
# Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
# Scope: The Logging Service in the app layer and the image list; the fake aws takes a glob, and
#        two checks that every repository missing the tag is named with the way out (issue #52,
#        review). Verified against the committed script: both fail, nothing else changes.
# Author review: pending - Jian Bing owns the deployment.
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-11
# Scope: The deploy takes Terraform's state lock, and fails fast when another change moves a
#   service mid-deploy (Jian Bing's choice after a deploy and an apply clashed on production).
# Author review: Pending Jian Bing's review.
#
# Run: infra/scripts/test/deploy-images.test.sh   (no AWS access needed; needs jq)
# AI-generated (Claude Code).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../deploy-images.sh"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
# Fake aws: records each call and what's registered. Failure switches, each naming one service:
# FAKE_MISSING (no such service), FAKE_WAIT_FAIL (never stable), FAKE_STUCK (stays on the old
# revision), FAKE_UNHEALTHY (its task fails the health check); FAKE_REGISTER_FAIL for every register.
cat > "$work/bin/aws" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$AWS_CALLS"
arg() { local want="$1"; shift; while [ $# -gt 0 ]; do [ "$1" = "$want" ] && { echo "$2"; return; }; shift; done; }
list() { local want="$1" on=0; shift; for a in "$@"; do case "$a" in "$want") on=1; continue ;; --*) on=0 ;; esac; [ $on = 1 ] && echo "$a"; done; }
td() { echo "arn:aws:ecs:ap-southeast-1:1:task-definition/foc-staging-$1:$2"; }
etag() { cksum < "$AWS_CALLS.lock" | cut -d' ' -f1; }
revision() {
  if [ -f "$AWS_CALLS.updated.$1" ] && [ "$1" = "${FAKE_MOVED:-}" ]; then echo 5   # someone else's change
  elif [ -f "$AWS_CALLS.updated.api-gateway" ] && [ "$1" = "${FAKE_MOVED_LATE:-}" ]; then echo 5   # after its layer passed
  elif [ -f "$AWS_CALLS.updated.$1" ] && [ "$1" != "${FAKE_STUCK:-}" ]; then echo 4; else echo 3; fi
}
case "$*" in
  ecs\ describe-services*)
    services=""; failures=""
    for s in $(list --services "$@"); do
      if [ "$s" = "${FAKE_MISSING:-}" ]; then
        failures="$failures,{\"arn\":\"arn:aws:ecs:ap-southeast-1:1:service/foc-staging/$s\",\"reason\":\"MISSING\"}"
        continue
      fi
      t=$(td "$s" "$(revision "$s")")
      services="$services,{\"serviceName\":\"$s\",\"status\":\"ACTIVE\",\"taskDefinition\":\"$t\",\"deployments\":[{\"status\":\"PRIMARY\",\"taskDefinition\":\"$t\"}]}"
    done
    echo "{\"services\":[${services#,}],\"failures\":[${failures#,}]}" ;;
  ecs\ describe-task-definition*)
    name=$(arg --task-definition "$@" | sed -E 's/.*foc-staging-//; s/:.*//')
    cat <<JSON
{"taskDefinitionArn":"arn","revision":3,"status":"ACTIVE","requiresAttributes":[],"compatibilities":["EC2"],
 "registeredAt":"t","registeredBy":"me","family":"foc-staging-$name","networkMode":"bridge",
 "containerDefinitions":[
  {"name":"$name","image":"1.dkr.ecr.ap-southeast-1.amazonaws.com/foc/$name:old0000"},
  {"name":"kafka-init","image":"1.dkr.ecr.ap-southeast-1.amazonaws.com/foc/kafka-init:old0000"},
  {"name":"other","image":"axllent/mailpit:v1.31.2"},
  {"name":"agent","image":"public.ecr.aws/ecs-service-connect/agent:1.0"}]}
JSON
    ;;
  ecs\ register-task-definition*)
    [ -z "${FAKE_REGISTER_FAIL:-}" ] || { echo "Unknown parameter in input" >&2; exit 254; }
    file=$(arg --cli-input-json "$@"); file=${file#file://}
    family=$(jq -r .family "$file"); cp "$file" "$AWS_CALLS.$family.json"
    echo "arn:aws:ecs:ap-southeast-1:1:task-definition/$family:4" ;;
  ecr\ describe-images*)
    # A glob, so FAKE_NO_IMAGE='*' makes every repository miss the tag (review).
    case "$(arg --repository-name "$@")" in
      foc/${FAKE_NO_IMAGE:-none}) echo "An error occurred (ImageNotFoundException) when calling the DescribeImages operation" >&2; exit 254 ;;
    esac
    echo '{"imageDetails":[{}]}' ;;
  # AI-generated (Claude Code, 2026-11-11): Terraform's lock file in the state bucket. A put fails
  # while the file exists, as an S3 conditional write does; FAKE_LOCK_FREES_AFTER=n frees it on the
  # n-th refused put, like an apply finishing.
  sts\ get-caller-identity*) echo 111122223333 ;;
  s3api\ put-object*)
    if [ -f "$AWS_CALLS.lock" ]; then
      n=$(( $(cat "$AWS_CALLS.held" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$AWS_CALLS.held"
      [ -n "${FAKE_LOCK_FREES_AFTER:-}" ] && [ "$n" -ge "$FAKE_LOCK_FREES_AFTER" ] && rm -f "$AWS_CALLS.lock"
      echo "An error occurred (PreconditionFailed) when calling the PutObject operation: At least one of the pre-conditions you specified did not hold" >&2
      exit 254
    fi
    cp "$(arg --body "$@")" "$AWS_CALLS.lock"; cp "$AWS_CALLS.lock" "$AWS_CALLS.body"; echo '{}' ;;
  s3api\ get-object*)
    if [ -n "${FAKE_LOCK_READ_FAIL:-}" ] && [ -f "$AWS_CALLS.lock" ]; then
      echo "An error occurred (AccessDenied) when calling the GetObject operation: Access Denied" >&2; exit 254
    fi
    if [ -n "${FAKE_RELEASE_GET_FAIL:-}" ] && [ -f "$AWS_CALLS.recorded" ]; then
      echo "Could not connect to the endpoint URL" >&2; exit 255
    fi
    [ -f "$AWS_CALLS.lock" ] || { echo "An error occurred (NoSuchKey) when calling the GetObject operation" >&2; exit 254; }
    cp "$AWS_CALLS.lock" "${*: -1}"; echo "{\"ETag\":\"\\\"$(etag)\\\"\"}" ;;
  s3api\ delete-object*)
    if [ -n "${FAKE_REPLACE_ON_DELETE:-}" ] && [ ! -f "$AWS_CALLS.replaced" ]; then
      touch "$AWS_CALLS.replaced"   # another run takes over between our read and our delete
      printf '{"ID":"fresh-id","Who":"another deploy","Created":"%s"}' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$AWS_CALLS.lock"
    fi
    want=$(arg --if-match "$@")
    if [ -n "$want" ] && [ "$want" != "\"$(etag)\"" ]; then
      echo "An error occurred (PreconditionFailed) when calling the DeleteObject operation" >&2; exit 254
    fi
    rm -f "$AWS_CALLS.lock"; echo '{}' ;;
  ssm\ put-parameter*) touch "$AWS_CALLS.recorded"; echo '{}' ;;
  ecs\ update-service*) touch "$AWS_CALLS.updated.$(arg --service "$@")"; echo '{}' ;;
  ecs\ wait*) case " $* " in *" ${FAKE_WAIT_FAIL:-none} "*) exit 255 ;; esac ;;
  ecs\ list-tasks*) echo "{\"taskArns\":[\"arn:aws:ecs:ap-southeast-1:1:task/foc-staging/$(arg --service-name "$@")-1\"]}" ;;
  ecs\ describe-tasks*)
    tasks=""
    for t in $(list --tasks "$@"); do
      s=${t##*/}; s=${s%-1}
      health=HEALTHY; [ "$s" = "${FAKE_UNHEALTHY:-}" ] && health=UNHEALTHY
      tasks="$tasks,{\"taskArn\":\"$t\",\"taskDefinitionArn\":\"$(td "$s" "$(revision "$s")")\",\"healthStatus\":\"$health\"}"
    done
    echo "{\"tasks\":[${tasks#,}]}" ;;
esac
FAKE
chmod +x "$work/bin/aws"
export PATH="$work/bin:$PATH" AWS_CALLS="$work/calls" HEALTH_INTERVAL=0 HEALTH_CHECKS=3
reset() { rm -f "$AWS_CALLS".*; : > "$AWS_CALLS"; }
# Someone else holds the lock: who, and since when (RFC 3339, as Terraform writes it).
hold() { printf '{"ID":"other-id","Operation":"%s","Who":"%s","Created":"%s"}' "${3:-OperationTypeApply}" "$1" "$2" > "$AWS_CALLS.lock"; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
export LOCK_POLL=0

reset
out=$("$SCRIPT" staging new1234 2>&1); code=$?
def="$AWS_CALLS.foc-staging-api-gateway.json"
check "a clean run succeeds" '[ $code -eq 0 ]'
check "only foc images change" '[ "$(jq -r ".containerDefinitions[].image" "$def" | tr "\n" " ")" = "1.dkr.ecr.ap-southeast-1.amazonaws.com/foc/api-gateway:new1234 1.dkr.ecr.ap-southeast-1.amazonaws.com/foc/kafka-init:new1234 axllent/mailpit:v1.31.2 public.ecr.aws/ecs-service-connect/agent:1.0 " ]'
check "read-only fields removed" '[ "$(jq -r "[has(\"taskDefinitionArn\"),has(\"revision\"),has(\"status\"),has(\"requiresAttributes\"),has(\"compatibilities\"),has(\"registeredAt\"),has(\"registeredBy\")] | any" "$def")" = false ]'
check "the rest of the definition is kept" '[ "$(jq -r .networkMode "$def")" = bridge ]'
order=$(grep -E "^ecs (update-service|wait)" "$AWS_CALLS" | sed -E 's/.*--service ([a-z-]+).*/update \1/; s/^ecs wait.*--services (.*)/wait \1/; s/ --region.*//')
expected="update user-service
update supplier-service
update credit-service
update order-service
update notification-service
update chat-service
update logging-service
wait user-service supplier-service credit-service order-service notification-service chat-service logging-service
update api-gateway
wait api-gateway
update frontend
wait frontend"
check "layers in order, each waiting before the next" '[ "$order" = "$expected" ]'
check "services move to the new revision" 'grep -q "update-service .*--service frontend .*task-definition/foc-staging-frontend:4" "$AWS_CALLS"'
check "tag recorded last" 'grep -v -E "^(s3api|sts) " "$AWS_CALLS" | tail -1 | grep -q "^ssm put-parameter .*--name /foc-deploy/staging/image-tag .*--value new1234"'
check "tag parameter overwrites and is a plain String" 'grep -v -E "^(s3api|sts) " "$AWS_CALLS" | tail -1 | grep -q -- "--type String --overwrite"'
check "every call pins the region" '[ "$(grep -vc -- "--region ap-southeast-1" "$AWS_CALLS")" = 0 ]'
check "uses the environment's cluster" 'grep -q "update-service --region ap-southeast-1 --cluster foc-staging" "$AWS_CALLS"'

repos=$(grep "^ecr describe-images" "$AWS_CALLS" | sed -E 's/.*--repository-name ([^ ]+).*/\1/' | sort | tr "\n" " ")
check "every foc image is checked on the tag" '[ "$repos" = "foc/api-gateway foc/chat-service foc/credit-service foc/frontend foc/kafka-init foc/logging-service foc/notification-service foc/order-service foc/supplier-service foc/user-service " ]'
check "images are checked with the tag under deploy" '[ "$(grep "^ecr describe-images" "$AWS_CALLS" | grep -vc -- "--image-ids imageTag=new1234")" = 0 ]'
check "images are checked before any change" '[ "$(grep -n "^ecr describe-images" "$AWS_CALLS" | tail -1 | cut -d: -f1)" -lt "$(grep -n "^ecs register-task-definition" "$AWS_CALLS" | head -1 | cut -d: -f1)" ]'

# AI-generated (Claude Code, 2026-11-11): the deploy holds Terraform's own state lock, so a
# "terraform apply" and a deploy can never change one environment at once.
check "the lock is Terraform's lock file for the environment" 'grep -q "^s3api put-object .*--bucket foc-terraform-state-111122223333 .*--key staging/terraform.tfstate.tflock" "$AWS_CALLS"'
check "the lock is only taken if nobody holds it" 'grep "^s3api put-object" "$AWS_CALLS" | grep -q -- "--if-none-match \*"'
check "the lock is taken before anything is read or changed" '[ "$(grep -n "^s3api put-object" "$AWS_CALLS" | head -1 | cut -d: -f1)" -lt "$(grep -n "^ecs describe-services" "$AWS_CALLS" | head -1 | cut -d: -f1)" ]'
check "the lock is released at the end" 'tail -1 "$AWS_CALLS" | grep -q "^s3api delete-object .*--key staging/terraform.tfstate.tflock" && [ ! -f "$AWS_CALLS.lock" ]'

reset
hold "jianbing@laptop (terraform apply)" "$(now)"
out=$(LOCK_WAIT=0 "$SCRIPT" staging new1234 2>&1); code=$?
check "a held lock stops the deploy before any change" '[ $code -ne 0 ] && ! grep -q -E "describe-services|update-service|put-parameter" "$AWS_CALLS"'
check "the refusal says who holds the lock" 'grep -q "jianbing@laptop" <<<"$out"'
check "someone else's lock is left alone" 'grep -q other-id "$AWS_CALLS.lock" && ! grep -q "^s3api delete-object" "$AWS_CALLS"'

reset
hold "jianbing@laptop (terraform apply)" "$(now)"
out=$(FAKE_LOCK_FREES_AFTER=2 LOCK_WAIT=60 "$SCRIPT" staging new1234 2>&1); code=$?
check "the deploy waits for a held lock and then runs" '[ $code -eq 0 ] && grep -q "locked by jianbing@laptop" <<<"$out" && grep -q "put-parameter .*image-tag" "$AWS_CALLS"'

reset
hold "a crashed run" "2020-01-01T00:00:00Z" deploy-images
out=$(LOCK_WAIT=0 "$SCRIPT" staging new1234 2>&1); code=$?
check "an abandoned deploy's lock (over 3 hours) is taken over" '[ $code -eq 0 ] && grep -q "a crashed run" <<<"$out"'

reset
out=$(FAKE_WAIT_FAIL=api-gateway "$SCRIPT" staging new1234 2>&1); code=$?
check "a failed deploy still releases the lock" '[ $code -ne 0 ] && grep -q "^s3api delete-object" "$AWS_CALLS" && [ ! -f "$AWS_CALLS.lock" ]'

# Codex review on #246.
reset
"$SCRIPT" staging new1234 > /dev/null 2>&1
check "every delete of the lock is conditional on the copy just read" '[ "$(grep -c "^s3api delete-object" "$AWS_CALLS")" -gt 0 ] && [ "$(grep "^s3api delete-object" "$AWS_CALLS" | grep -vc -- "--if-match")" = 0 ]'
reset
hold "a crashed run" "2020-01-01T00:00:00Z" deploy-images
out=$(FAKE_REPLACE_ON_DELETE=1 LOCK_WAIT=0 "$SCRIPT" staging new1234 2>&1); code=$?
check "taking over an abandoned lock never deletes a fresh one" '[ $code -ne 0 ] && grep -q fresh-id "$AWS_CALLS.lock" && grep -q "another deploy" <<<"$out"'
reset
out=$(FAKE_MOVED_LATE=user-service "$SCRIPT" staging new1234 2>&1); code=$?
check "a service moved after its layer passed is caught before the tag is recorded" '[ $code -ne 0 ] && ! grep -q "put-parameter" "$AWS_CALLS" && grep -q "user-service was moved" <<<"$out"'
reset
out=$(FAKE_RELEASE_GET_FAIL=1 "$SCRIPT" staging new1234 2>&1); code=$?
check "a lock that can't be released fails loudly, after retrying" '[ $code -ne 0 ] && grep -q "put-parameter .*image-tag" "$AWS_CALLS" && grep -q "force-unlock" <<<"$out" && [ "$(sed -n "/put-parameter/,\$p" "$AWS_CALLS" | grep -c "^s3api get-object")" -ge 3 ]'

# Codex's second review on #246.
reset
hold "jianbing@laptop" "2020-01-01T00:00:00Z" OperationTypeApply
out=$(LOCK_WAIT=0 "$SCRIPT" staging new1234 2>&1); code=$?
check "a terraform apply's lock is never taken over, however old" '[ $code -ne 0 ] && grep -q other-id "$AWS_CALLS.lock" && ! grep -q "update-service" "$AWS_CALLS" && grep -q "force-unlock" <<<"$out"'
reset
hold "jianbing@laptop" "$(now)"
# perl's alarm, as macOS has no timeout(1): a deploy that spins here is killed after 20 s.
out=$(FAKE_LOCK_READ_FAIL=1 LOCK_WAIT=0 perl -e 'alarm 20; exec @ARGV' "$SCRIPT" staging new1234 2>&1); code=$?
check "unreadable locks count toward the wait instead of spinning" '[ $code -ne 0 ] && [ $code -ne 142 ] && ! grep -q "update-service" "$AWS_CALLS"'

reset
GITHUB_RUN_ID=42 GITHUB_WORKFLOW="Deploy staging" "$SCRIPT" staging new1234 > /dev/null 2>&1
check "the lock says which run holds it" '[ "$(jq -r .Who "$AWS_CALLS.body")" = "GitHub run 42 (Deploy staging)" ]'

# A change that skips the lock (the console, say) moving a service mid-deploy: say so at once,
# rather than waiting out the health checks and calling the service unhealthy.
reset
out=$(FAKE_MOVED=user-service HEALTH_CHECKS=50 "$SCRIPT" staging new1234 2>&1); code=$?
check "a service moved by another change fails the deploy" '[ $code -ne 0 ] && ! grep -q "put-parameter" "$AWS_CALLS"'
check "the failure says it was moved, and to what" 'grep -q "user-service was moved to foc-staging-user-service:5 by another change" <<<"$out"'
check "it fails at once, not after the health checks" '[ "$(grep -c "^ecs describe-services" "$AWS_CALLS")" -lt 10 ]'

reset
out=$(FAKE_NO_IMAGE=frontend "$SCRIPT" production new1234 2>&1); code=$?
check "a tag missing from one repository stops the deploy before any change" '[ $code -ne 0 ] && ! grep -q -E "register-task-definition|update-service|put-parameter" "$AWS_CALLS"'
check "the repository without the image is named" 'grep -q "foc/frontend" <<<"$out"'
# AI-generated (Claude Code): every missing repository at once, and the way out of a rollback to a
# tag older than a service, which is the same failure (review).
reset
out=$(FAKE_NO_IMAGE='*' "$SCRIPT" production old0000 2>&1); code=$?
check "every repository missing the tag is named at once" '[ $code -ne 0 ] &&
  grep -q "foc/logging-service" <<<"$out" && grep -q "foc/user-service" <<<"$out" &&
  grep -q "foc/frontend" <<<"$out"'
check "the fix is a command, and the rollback case is called out" 'grep -q "push-images.sh old0000" <<<"$out" &&
  grep -qi "older than a service" <<<"$out"'

reset
out=$(FAKE_WAIT_FAIL=api-gateway "$SCRIPT" staging new1234 2>&1); code=$?
check "failed wait leaves the tag: exits non-zero" '[ $code -ne 0 ]'
check "failed wait leaves the tag: no parameter written" '! grep -q "put-parameter" "$AWS_CALLS"'
check "failed wait stops the rollout" '! grep -q "update-service .*--service frontend" "$AWS_CALLS"'
check "a slow rollout gets three rounds of waiting" '[ "$(grep -c "^ecs wait .*api-gateway" "$AWS_CALLS")" = 3 ]'
check "the failure names the layer" 'grep -q "api-gateway" <<<"$out"'

# Final review, I2: a register that fails must stop the deploy, not roll an empty revision.
reset
out=$(FAKE_REGISTER_FAIL=1 "$SCRIPT" staging new1234 2>&1); code=$?
check "a failed register stops the deploy" '[ $code -ne 0 ] && ! grep -q "update-service" "$AWS_CALLS" && ! grep -q "put-parameter" "$AWS_CALLS"'

# Final review, I4: a service the environment doesn't have yet (no terraform apply) stops
# everything before the first update.
reset
out=$(FAKE_MISSING=notification-service "$SCRIPT" staging new1234 2>&1); code=$?
check "a missing service stops the deploy before any update" '[ $code -ne 0 ] && ! grep -q "update-service" "$AWS_CALLS"'
check "the missing service is named" 'grep -q "notification-service" <<<"$out"'

# Final review, I3: "stable" only counts running tasks. The new revision must be the one running,
# and healthy.
reset
out=$(FAKE_UNHEALTHY=api-gateway "$SCRIPT" staging new1234 2>&1); code=$?
check "an unhealthy gateway fails the deploy" '[ $code -ne 0 ] && ! grep -q "put-parameter" "$AWS_CALLS"'
check "an unhealthy gateway stops the rollout" '! grep -q "update-service .*--service frontend" "$AWS_CALLS"'
reset
out=$(FAKE_STUCK=api-gateway "$SCRIPT" staging new1234 2>&1); code=$?
check "a service left on the old revision fails the deploy" '[ $code -ne 0 ] && ! grep -q "put-parameter" "$AWS_CALLS"'

reset
"$SCRIPT" nowhere new1234 > /dev/null 2>&1; code=$?
check "rejects an unknown env" '[ $code -ne 0 ] && [ ! -s "$AWS_CALLS" ]'
"$SCRIPT" staging > /dev/null 2>&1; code=$?
check "rejects a missing tag" '[ $code -ne 0 ] && [ ! -s "$AWS_CALLS" ]'

echo "$fails failed"
[ "$fails" -eq 0 ]
