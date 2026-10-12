#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-12
# Scope: Reproducible native Envoy build and regression tests.
# Author review: Pending human review.
# AI-generated; review pending.
set -euo pipefail
if [ ! -d /workspace/envoy-linux/.git ]; then
  git -c core.autocrlf=false clone --depth 1 --branch v1.38.6 \
    https://github.com/envoyproxy/envoy.git /workspace/envoy-linux
fi
cd /workspace/envoy-linux
git config --global --add safe.directory /workspace/envoy-linux
test "$(git rev-parse HEAD)" = 58e082ee0eb9f9b06fb46586c4df03dbf269f3f8
if git apply --check /input/foc-jwt.patch; then
  git apply /input/foc-jwt.patch
else
  git apply --reverse --check /input/foc-jwt.patch
fi
export TEST_TMPDIR=/workspace/cache
mkdir -p "$TEST_TMPDIR" /output/bin
flags=(--config=clang -c opt --jobs=4 --local_resources=memory=4096
       --override_repository=envoy_build_config=/input/extensions)
bazel --output_user_root=/workspace/cache/bazel --host_jvm_args=-Xmx1024m test \
  "${flags[@]}" //test/extensions/filters/http/jwt_authn:authenticator_test \
  --test_filter='FocAuthenticatorTest.*' --test_output=errors
bazel --output_user_root=/workspace/cache/bazel --host_jvm_args=-Xmx1024m build \
  "${flags[@]}" //source/exe:envoy-static
cp bazel-bin/source/exe/envoy-static /output/bin/envoy
/output/bin/envoy --version
