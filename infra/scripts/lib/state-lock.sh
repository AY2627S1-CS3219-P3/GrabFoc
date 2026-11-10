# shellcheck shell=bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-11
# Scope: Generated after a deploy and a "terraform apply" changed production at the same time and
#   the deploy failed on a revision the apply had replaced. Jian Bing chose to share Terraform's own
#   state lock rather than add a separate one.
# Author review: Pending Jian Bing's review.
#
# Terraform's S3 backend (use_lockfile) locks an environment by creating
# <env>/terraform.tfstate.tflock in the state bucket, only if it doesn't exist. A deploy takes the
# same file the same way, so a deploy and an apply can never change one environment at once:
# whichever comes second waits. "terraform apply -lock-timeout=20m" waits for a deploy.
# AI-generated (Claude Code).

lock_wait="${LOCK_WAIT:-900}"     # seconds to wait for someone else's lock
lock_poll="${LOCK_POLL:-20}"      # seconds between tries
lock_stale="${LOCK_STALE:-10800}" # a lock this old (3 h, past the longest deploy) is abandoned

# Seconds since an RFC 3339 time such as Terraform's "2026-11-10T15:40:17.123456Z".
lock_age() {
  local epoch
  epoch=$(jq -rn --arg t "$1" '$t | sub("\\.[0-9]+"; "") | fromdateiso8601' 2>/dev/null) || { echo 0; return; }
  echo $(( $(date -u +%s) - epoch ))
}

# state_lock_take <env> <region> <what this run is doing>
state_lock_take() {
  local env="$1" region="$2" info="$3" body held out who created me waited=0
  if [ -n "${GITHUB_RUN_ID:-}" ]; then me="GitHub run $GITHUB_RUN_ID (${GITHUB_WORKFLOW:-deploy})"
  else me="$(whoami)@$(hostname -s)"; fi
  lock_region="$region"
  lock_bucket="foc-terraform-state-$(aws sts get-caller-identity --region "$region" --query Account --output text)"
  lock_key="$env/terraform.tfstate.tflock"
  lock_id="deploy-$(date -u +%s)-$$-$RANDOM"
  body=$(mktemp); held=$(mktemp)
  jq -n --arg id "$lock_id" --arg info "$info" --arg path "$lock_bucket/$env/terraform.tfstate" \
    --arg who "$me" \
    --arg created "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ID: $id, Operation: "deploy-images", Info: $info, Who: $who, Version: "", Created: $created, Path: $path}' > "$body"
  while :; do
    if out=$(aws s3api put-object --region "$region" --bucket "$lock_bucket" --key "$lock_key" \
        --body "$body" --if-none-match '*' 2>&1 > /dev/null); then
      lock_held=1
      rm -f "$body" "$held"
      return 0
    fi
    case "$out" in
      *PreconditionFailed* | *ConditionalRequestConflict*) ;;
      *) echo "couldn't take $env's lock: $out" >&2; rm -f "$body" "$held"; return 1 ;;
    esac
    # Released between the two calls: just try again.
    aws s3api get-object --region "$region" --bucket "$lock_bucket" --key "$lock_key" "$held" > /dev/null 2>&1 || continue
    who=$(jq -r '.Who // "someone"' "$held" 2>/dev/null || echo someone)
    created=$(jq -r '.Created // ""' "$held" 2>/dev/null || echo "")
    if [ -n "$created" ] && [ "$(lock_age "$created")" -gt "$lock_stale" ]; then
      echo "== taking over $env's lock from $who: held since $created, over $((lock_stale / 3600)) hours, so abandoned"
      aws s3api delete-object --region "$region" --bucket "$lock_bucket" --key "$lock_key" > /dev/null
      continue
    fi
    if [ "$waited" -ge "$lock_wait" ]; then
      echo "$env is locked by $who since $created (a terraform apply or another deploy). Nothing was changed." >&2
      echo "Wait for it to finish and run this again. If it's abandoned: terraform force-unlock <ID> in" >&2
      echo "infra/terraform/envs/$env (the ID is in s3://$lock_bucket/$lock_key)." >&2
      rm -f "$body" "$held"
      return 1
    fi
    echo "== $env is locked by $who since $created; waiting (${waited}s of ${lock_wait}s)"
    sleep "$lock_poll"
    waited=$((waited + lock_poll))
  done
}

# Releases the lock, but only if it is still ours (it may have been taken over).
state_lock_release() {
  [ "${lock_held:-}" = 1 ] || return 0
  local held
  held=$(mktemp)
  if aws s3api get-object --region "$lock_region" --bucket "$lock_bucket" --key "$lock_key" "$held" > /dev/null 2>&1 &&
    [ "$(jq -r '.ID // ""' "$held")" = "$lock_id" ]; then
    aws s3api delete-object --region "$lock_region" --bucket "$lock_bucket" --key "$lock_key" > /dev/null
  fi
  rm -f "$held"
  lock_held=""
}
