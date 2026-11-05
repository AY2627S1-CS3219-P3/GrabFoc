#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Generated from the deployment plan (deploy part 3, #143, Task 3): tests deploy-images.sh.
# Author review: Pending Jian Bing's review.
#
# Run: infra/scripts/test/deploy-images.test.sh   (no AWS access needed; needs jq)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../deploy-images.sh"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
# Fake aws: records each call; saves what's registered; fails waits on FAKE_WAIT_FAIL.
cat > "$work/bin/aws" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$AWS_CALLS"
arg() { local want="$1"; shift; while [ $# -gt 0 ]; do [ "$1" = "$want" ] && { echo "$2"; return; }; shift; done; }
case "$*" in
  ecs\ describe-services*) echo "arn:aws:ecs:ap-southeast-1:1:task-definition/foc-$(arg --cluster "$@" | cut -d- -f2)-$(arg --services "$@"):3" ;;
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
    file=$(arg --cli-input-json "$@"); file=${file#file://}
    family=$(jq -r .family "$file"); cp "$file" "$AWS_CALLS.$family.json"
    echo "arn:aws:ecs:ap-southeast-1:1:task-definition/$family:4" ;;
  ecs\ wait*) case " $* " in *" ${FAKE_WAIT_FAIL:-none} "*) exit 255 ;; esac ;;
esac
FAKE
chmod +x "$work/bin/aws"
export PATH="$work/bin:$PATH" AWS_CALLS="$work/calls"

: > "$AWS_CALLS"
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
wait user-service supplier-service credit-service order-service notification-service
update api-gateway
wait api-gateway
update frontend
wait frontend"
check "layers in order, each waiting before the next" '[ "$order" = "$expected" ]'
check "services move to the new revision" 'grep -q "update-service .*--service frontend .*task-definition/foc-staging-frontend:4" "$AWS_CALLS"'
check "tag recorded last" 'tail -1 "$AWS_CALLS" | grep -q "^ssm put-parameter .*--name /foc-deploy/staging/image-tag .*--value new1234"'
check "tag parameter overwrites and is a plain String" 'tail -1 "$AWS_CALLS" | grep -q -- "--type String --overwrite"'
check "every call pins the region" '[ "$(grep -vc -- "--region ap-southeast-1" "$AWS_CALLS")" = 0 ]'
check "uses the environment's cluster" 'grep -q "update-service --region ap-southeast-1 --cluster foc-staging" "$AWS_CALLS"'

: > "$AWS_CALLS"
out=$(FAKE_WAIT_FAIL=api-gateway "$SCRIPT" staging new1234 2>&1); code=$?
check "failed wait leaves the tag: exits non-zero" '[ $code -ne 0 ]'
check "failed wait leaves the tag: no parameter written" '! grep -q "put-parameter" "$AWS_CALLS"'
check "failed wait stops the rollout" '! grep -q "update-service .*--service frontend" "$AWS_CALLS"'
check "a slow rollout gets three rounds of waiting" '[ "$(grep -c "^ecs wait .*api-gateway" "$AWS_CALLS")" = 3 ]'
check "the failure names the layer" 'grep -q "api-gateway" <<<"$out"'

: > "$AWS_CALLS"
"$SCRIPT" nowhere new1234 > /dev/null 2>&1; code=$?
check "rejects an unknown env" '[ $code -ne 0 ] && [ ! -s "$AWS_CALLS" ]'
"$SCRIPT" staging > /dev/null 2>&1; code=$?
check "rejects a missing tag" '[ $code -ne 0 ] && [ ! -s "$AWS_CALLS" ]'

echo "$fails failed"
[ "$fails" -eq 0 ]
