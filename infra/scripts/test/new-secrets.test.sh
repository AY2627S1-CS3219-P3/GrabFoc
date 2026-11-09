#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
# Scope: Tests new-secrets.sh (deploy part 2, first live apply).
#        2026-10-27 (Claude Code, Claude Opus 5.5): fixes from the Codex review on PR #146.
# Author review (Jian Bing, 2026-11-06): Not read line by line; these tests pass in CI (terraform.yml).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
# Scope: Notification's secrets and --add-missing (deploy part 3).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
# Scope: CHAT_TICKET_SECRET is generated, at least 32 characters, and added by --add-missing (chat, #230).
# Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
#
# Run: infra/scripts/test/new-secrets.test.sh
# AI-generated (Claude Code).
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
# ls, not stat: BSD and GNU stat take different flags (Codex review on #146).
check "file is private (600)" '[ "$(ls -l "$file" | cut -c1-10)" = "-rw-------" ]'
for n in POSTGRES_PASSWORD SUPPLIER_POSTGRES_PASSWORD CREDIT_POSTGRES_PASSWORD ORDER_DB_PASSWORD NOTIFICATION_POSTGRES_PASSWORD CREDIT_SERVICE_KEY ORDER_SERVICE_KEY USER_INTERNAL_SERVICE_KEY CHAT_TICKET_SECRET USER_JWT_KID; do
  check "$n generated" '[ -n "$(val '"$n"')" ]'
done
# AI-generated (Claude Code): Order refuses a chat ticket secret under 32 characters.
check "chat ticket secret is at least 32 characters" '[ "$(val CHAT_TICKET_SECRET | tr -d "\n" | wc -c)" -ge 32 ]'
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

# AI-generated (Claude Code).
# --add-missing: an environment created before a secret existed gets it, and nothing else changes.
grep -v '^NOTIFICATION_POSTGRES_PASSWORD=\|^USER_INTERNAL_SERVICE_KEY=\|^CHAT_TICKET_SECRET=' "$file" > "$file.new"
printf '%s' "$(cat "$file.new")" > "$file" # no newline at the end of the file
rm "$file.new"
before=$(cat "$file")
out=$(FOC_REPO_ROOT="$work" "$HERE/../new-secrets.sh" staging --add-missing 2>&1); code=$?
check "--add-missing succeeds" '[ $code -eq 0 ]'
check "--add-missing keeps every existing line" '[ "$(head -c ${#before} "$file")" = "$before" ]'
check "--add-missing adds the new names" '[ "$(val USER_INTERNAL_SERVICE_KEY | wc -c)" -gt 32 ] && [ -n "$(val NOTIFICATION_POSTGRES_PASSWORD)" ] && [ "$(val CHAT_TICKET_SECRET | tr -d "\n" | wc -c)" -ge 32 ]'
check "--add-missing starts them on their own lines" '[ "$(grep -c "^USER_INTERNAL_SERVICE_KEY=" "$file")" = 1 ]'
check "--add-missing prints names, not values" 'grep -q "added USER_INTERNAL_SERVICE_KEY" <<<"$out" && ! grep -qF "$(val USER_INTERNAL_SERVICE_KEY)" <<<"$out"'
check "--add-missing keeps the file private" '[ "$(ls -l "$file" | cut -c1-10)" = "-rw-------" ]'
after=$(cat "$file")
FOC_REPO_ROOT="$work" "$HERE/../new-secrets.sh" staging --add-missing >/dev/null 2>&1; code=$?
check "--add-missing twice changes nothing" '[ $code -eq 0 ] && [ "$(cat "$file")" = "$after" ]'
rm "$file"
FOC_REPO_ROOT="$work" "$HERE/../new-secrets.sh" staging --add-missing >/dev/null 2>&1; code=$?
check "--add-missing needs an existing file" '[ $code -ne 0 ] && [ ! -e "$file" ]'

echo "$fails failed"
[ "$fails" -eq 0 ]
