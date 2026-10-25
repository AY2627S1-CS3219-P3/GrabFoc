#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 7).
# Author review: Pending Jian Bing's review.
#
# Loads one environment's secrets into SSM Parameter Store as SecureStrings under /foc/<env>/.
#   infra/scripts/put-secrets.sh staging      # reads infra/secrets/staging.env (git-ignored)
# The file uses .env syntax (NAME=value). Values are passed to the AWS CLI through a private temp
# file, never on the command line, and never printed.
set -euo pipefail

env="${1:-}"
case "$env" in
  staging | production) ;;
  *) echo "usage: $0 staging|production" >&2; exit 2 ;;
esac

root="${FOC_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
file="$root/infra/secrets/$env.env"
[ -f "$file" ] || { echo "missing $file (copy the names from infra/secrets/README.md)" >&2; exit 1; }

# Every SSM name the ECS task definitions read (infra/terraform/modules/services), except the three
# built below.
required=(
  POSTGRES_PASSWORD SUPPLIER_POSTGRES_PASSWORD CREDIT_POSTGRES_PASSWORD ORDER_DB_PASSWORD
  USER_AES_KEY USER_EMAIL_HMAC_KEY USER_OTP_HMAC_KEY USER_JWT_PRIVATE_KEY USER_JWT_KID
  USER_SMTP_USER USER_SMTP_PASS USER_SMTP_FROM USER_BOOTSTRAP_ADMIN_EMAIL
  CREDIT_SERVICE_KEY ORDER_SERVICE_KEY
)

# Works on macOS's bash 3.2 too (no associative arrays): look a name up in the file each time.
get() {
  local line v
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "$1="*) ;; *) continue ;; esac
    v="${line#*=}"
    if [[ "$v" == \"*\" || "$v" == \'*\' ]]; then v="${v:1:${#v}-2}"; fi
    printf '%s' "$v"
    return 0
  done < "$file"
}

missing=()
for name in "${required[@]}"; do
  [ -n "$(get "$name")" ] || missing+=("$name")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "$file is missing: ${missing[*]}" >&2
  exit 1
fi

# Built exactly as the compose files build them.
built() {
  case "$1" in
    USER_DATABASE_URL) printf 'postgres://foc:%s@user-db:5432/users' "$(get POSTGRES_PASSWORD)" ;;
    SUPPLIER_DATABASE_URL) printf 'postgres://foc:%s@supplier-db:5432/supplier' "$(get SUPPLIER_POSTGRES_PASSWORD)" ;;
    MAILPIT_SMTP_AUTH) printf '%s:%s' "$(get USER_SMTP_USER)" "$(get USER_SMTP_PASS)" ;; # staging Mailpit's login
    *) get "$1" ;;
  esac
}

tmp=$(mktemp)
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
for name in "${required[@]}" USER_DATABASE_URL SUPPLIER_DATABASE_URL MAILPIT_SMTP_AUTH; do
  built "$name" > "$tmp"
  aws ssm put-parameter --name "/foc/$env/$name" --type SecureString --overwrite \
    --value "file://$tmp" > /dev/null
  echo "set /foc/$env/$name"
done
