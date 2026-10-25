#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (Task 7): tests put-secrets.sh against a fake `aws`.
# Author review: Pending Jian Bing's review.
#
# Run: infra/scripts/test/put-secrets.test.sh   (no AWS access needed)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../put-secrets.sh"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/repo/infra/secrets"
# Fake aws: records "<name>=<value>" for each put-parameter (reading --value file://…).
cat > "$work/bin/aws" <<'FAKE'
#!/usr/bin/env bash
name=""; value=""
while [ $# -gt 0 ]; do
  case "$1" in
    --name) name="$2"; shift ;;
    --value) value="$(cat "${2#file://}")"; shift ;;
  esac
  shift
done
printf '%s=%s\n' "$name" "$value" >> "$AWS_CALLS"
FAKE
chmod +x "$work/bin/aws"
export PATH="$work/bin:$PATH" AWS_CALLS="$work/calls"

full() {
  cat <<'ENV'
# staging secrets
POSTGRES_PASSWORD=pg-user-pw
SUPPLIER_POSTGRES_PASSWORD=pg-supplier-pw
CREDIT_POSTGRES_PASSWORD=pg-credit-pw
ORDER_DB_PASSWORD=pg-order-pw
USER_AES_KEY=aes-secret
USER_EMAIL_HMAC_KEY=email-hmac-secret
USER_OTP_HMAC_KEY=otp-hmac-secret
USER_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
USER_JWT_KID=kid-1
USER_SMTP_USER=foc.app@gmail.com
USER_SMTP_PASS=gmail-app-password
USER_SMTP_FROM=FoC <foc.app@gmail.com>
USER_BOOTSTRAP_ADMIN_EMAIL=admin@u.nus.edu
CREDIT_SERVICE_KEY=credit-key
ORDER_SERVICE_KEY=order-key
ENV
}

# 1. A missing name stops everything before any call.
full | grep -v '^USER_AES_KEY=' > "$work/repo/infra/secrets/staging.env"
: > "$AWS_CALLS"
out=$(FOC_REPO_ROOT="$work/repo" "$SCRIPT" staging 2>&1); code=$?
check "missing name exits non-zero" '[ $code -ne 0 ]'
check "missing name is named" 'grep -q USER_AES_KEY <<<"$out"'
check "missing name makes no AWS call" '[ ! -s "$AWS_CALLS" ]'

# 2. A full file writes every parameter, plus the three built from them.
full > "$work/repo/infra/secrets/staging.env"
: > "$AWS_CALLS"
out=$(FOC_REPO_ROOT="$work/repo" "$SCRIPT" staging 2>&1); code=$?
check "full file exits zero" '[ $code -eq 0 ]'
check "18 parameters written" '[ "$(wc -l < "$AWS_CALLS" | tr -d " ")" = 18 ]'
check "names are under /foc/staging/" '! grep -qv "^/foc/staging/" "$AWS_CALLS"'
check "user database URL built as in compose" 'grep -qx "/foc/staging/USER_DATABASE_URL=postgres://foc:pg-user-pw@user-db:5432/users" "$AWS_CALLS"'
check "supplier database URL built as in compose" 'grep -qx "/foc/staging/SUPPLIER_DATABASE_URL=postgres://foc:pg-supplier-pw@supplier-db:5432/supplier" "$AWS_CALLS"'
check "Mailpit login is user:password" 'grep -qx "/foc/staging/MAILPIT_SMTP_AUTH=foc.app@gmail.com:gmail-app-password" "$AWS_CALLS"'
check "quotes around a value are removed" 'grep -q "^/foc/staging/USER_JWT_PRIVATE_KEY=-----BEGIN" "$AWS_CALLS"'
check "no secret value is printed" '! grep -qE "pg-user-pw|gmail-app-password|aes-secret|order-key" <<<"$out"'

# 3. Only staging and production are accepted.
out=$(FOC_REPO_ROOT="$work/repo" "$SCRIPT" dev 2>&1); code=$?
check "unknown environment rejected" '[ $code -ne 0 ]'

echo "$fails failed"
[ "$fails" -eq 0 ]
