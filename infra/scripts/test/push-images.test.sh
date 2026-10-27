#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
# Scope: Tests that push-images.sh can be rerun after a partial push (Codex review on #146).
# Author review: Pending Jian Bing's review.
#
# Run: infra/scripts/test/push-images.test.sh   (no AWS or Docker access needed)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
# Fake aws: user-service and order-service already have the tag in ECR (immutable tags).
cat > "$work/bin/aws" <<'FAKE'
#!/usr/bin/env bash
case "$*" in
  *get-caller-identity*) echo 123456789012 ;;
  *get-login-password*) echo token ;;
  *describe-images*foc/user-service*|*describe-images*foc/order-service*) echo '{}' ;;
  *describe-images*) echo "ImageNotFoundException" >&2; exit 254 ;;
esac
FAKE
# Fake docker: records builds and pushes; pushing an existing tag fails as ECR does.
cat > "$work/bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$DOCKER_CALLS"
case "$*" in push*user-service*|push*order-service*) echo "tag already exists" >&2; exit 1 ;; esac
FAKE
chmod +x "$work/bin/aws" "$work/bin/docker"
export PATH="$work/bin:$PATH" DOCKER_CALLS="$work/calls"

out=$("$HERE/../push-images.sh" abc1234 2>&1); code=$?
check "rerun succeeds" '[ $code -eq 0 ]'
check "existing tags are skipped" '! grep -qE "(build|push).*foc/(user|order)-service:" "$DOCKER_CALLS"'
check "skips are reported" 'grep -q "foc/user-service:abc1234 already in ECR, skipped" <<<"$out"'
check "missing tags are built and pushed" '[ "$(grep -c "^push " "$DOCKER_CALLS")" = 5 ]'

echo "$fails failed"
[ "$fails" -eq 0 ]
