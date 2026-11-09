#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Generates an environment's secrets file for the first live apply (deploy part 2).
# Author review (Jian Bing, 2026-11-06): Went through it with Claude Code's walkthrough and understood it; ran
#   infra/terraform/check.sh (every stack valid, all tests passed) and checked staging (the locations list and
#   the admin locations page load).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Notification's secrets and --add-missing (deploy part 3).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
# Scope: CHAT_TICKET_SECRET, generated and added by --add-missing (chat, #230).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
# Scope: LOGGING_POSTGRES_PASSWORD, generated and added by --add-missing (issue #52).
# Author review: pending - Jian Bing owns the deployment.
#
# Creates infra/secrets/<env>.env (git-ignored, mode 600) with fresh random values for every
# generated secret, the same formats as .env.example asks for. It never prints a value and never
# overwrites an existing file. Fill in the four Gmail/admin lines yourself, then run put-secrets.sh.
#   infra/scripts/new-secrets.sh staging
# For an environment created before a secret existed, this appends only the missing ones:
#   infra/scripts/new-secrets.sh staging --add-missing
# AI-generated (Claude Code).
set -euo pipefail

env="${1:-}"
mode="${2:-}"
case "$env" in
  staging | production) ;;
  *) echo "usage: $0 staging|production [--add-missing]" >&2; exit 2 ;;
esac

root="${FOC_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
file="$root/infra/secrets/$env.env"

# AI-generated (Claude Code).
hex() { openssl rand -hex 32; }
key32() { openssl rand -base64 32; }

if [ "$mode" = "--add-missing" ]; then
  [ -f "$file" ] || { echo "$file doesn't exist; run without --add-missing first" >&2; exit 1; }
  for name in NOTIFICATION_POSTGRES_PASSWORD USER_INTERNAL_SERVICE_KEY CHAT_TICKET_SECRET LOGGING_POSTGRES_PASSWORD; do
    grep -q "^$name=" "$file" && continue
    [ -z "$(tail -c 1 "$file")" ] || echo >> "$file" # the file may not end in a newline
    echo "$name=$(hex)" >> "$file"
    echo "added $name"
  done
  exit 0
fi

if [ -e "$file" ]; then
  echo "$file already exists; not touching it" >&2
  exit 1
fi

umask 077
{
  echo "# $env secrets, generated $(date +%Y-%m-%d). Never commit. Load with: infra/scripts/put-secrets.sh $env"
  echo "POSTGRES_PASSWORD=$(hex)"
  echo "SUPPLIER_POSTGRES_PASSWORD=$(hex)"
  echo "CREDIT_POSTGRES_PASSWORD=$(hex)"
  echo "ORDER_DB_PASSWORD=$(hex)"
  echo "NOTIFICATION_POSTGRES_PASSWORD=$(hex)"
  echo "LOGGING_POSTGRES_PASSWORD=$(hex)" # AI-generated (Claude Code): the log store (#52)
  echo "CREDIT_SERVICE_KEY=$(hex)"
  echo "ORDER_SERVICE_KEY=$(hex)"
  echo "USER_INTERNAL_SERVICE_KEY=$(hex)"
  echo "CHAT_TICKET_SECRET=$(hex)" # AI-generated (Claude Code): Order and chat share it (#230)
  echo "USER_AES_KEY=$(key32)"
  echo "USER_EMAIL_HMAC_KEY=$(key32)"
  echo "USER_OTP_HMAC_KEY=$(key32)"
  echo "USER_JWT_PRIVATE_KEY=$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null | base64 | tr -d '\n')"
  echo "USER_JWT_KID=$env-$(date +%Y-%m)"
  echo "# Fill these in yourself (Gmail with 2-step verification; app password without spaces):"
  echo "USER_SMTP_USER="
  echo "USER_SMTP_PASS="
  echo "USER_SMTP_FROM="
  echo "USER_BOOTSTRAP_ADMIN_EMAIL="
} > "$file"
chmod 600 "$file"
echo "wrote $file: fill in USER_SMTP_USER, USER_SMTP_PASS, USER_SMTP_FROM, USER_BOOTSTRAP_ADMIN_EMAIL"
