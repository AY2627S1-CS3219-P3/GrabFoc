#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Tests new-secrets.sh (deploy part 2, first live apply).
# Author review: Pending Jian Bing's review.
#
# Run: infra/scripts/test/new-secrets.test.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/infra/secrets"
file="$work/infra/secrets/staging.env"
val() { grep "^$1=" "$file" | cut -d= -f2-; }

out=$(FOC_REPO_ROOT="$work" "$HERE/../new-secrets.sh" staging 2>&1); code=$?
check "creates the file" '[ $code -eq 0 ] && [ -f "$file" ]'
check "file is private (600)" '[ "$(stat -f %Lp "$file" 2>/dev/null || stat -c %a "$file")" = 600 ]'
for n in POSTGRES_PASSWORD SUPPLIER_POSTGRES_PASSWORD CREDIT_POSTGRES_PASSWORD ORDER_DB_PASSWORD CREDIT_SERVICE_KEY ORDER_SERVICE_KEY USER_JWT_KID; do
  check "$n generated" '[ -n "$(val '"$n"')" ]'
done
for n in USER_AES_KEY USER_EMAIL_HMAC_KEY USER_OTP_HMAC_KEY; do
  check "$n is 32 bytes base64" '[ "$(val '"$n"' | base64 -d 2>/dev/null | wc -c | tr -d " ")" = 32 ]'
done
check "JWT key is a base64 RSA private key" 'val USER_JWT_PRIVATE_KEY | base64 -d 2>/dev/null | grep -q "BEGIN PRIVATE KEY"'
check "service keys are at least 32 characters" '[ "$(val CREDIT_SERVICE_KEY | wc -c)" -gt 32 ]'
for n in USER_SMTP_USER USER_SMTP_PASS USER_SMTP_FROM USER_BOOTSTRAP_ADMIN_EMAIL; do
  check "$n left for you to fill" 'grep -qx "'"$n"'=" "$file"'
done
check "no generated value printed" '! grep -qF "$(val POSTGRES_PASSWORD)" <<<"$out"'

before=$(cat "$file")
FOC_REPO_ROOT="$work" "$HERE/../new-secrets.sh" staging >/dev/null 2>&1; code=$?
check "refuses to overwrite an existing file" '[ $code -ne 0 ] && [ "$(cat "$file")" = "$before" ]'

echo "$fails failed"
[ "$fails" -eq 0 ]
