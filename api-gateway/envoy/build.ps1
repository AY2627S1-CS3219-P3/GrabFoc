# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-10-12
# Scope: Build the approved custom Envoy with a pinned Linux toolchain from Windows.
# Author review: Pending human review.
# AI-generated; review pending.
$ErrorActionPreference = 'Stop'
$gatewayDirectory = Split-Path -Parent $PSScriptRoot
$buildImage = 'docker.io/envoyproxy/envoy-build@sha256:20656853fae51927cda557e7af80ccff175f5de6f84bd0f092cd8672b2a6e0fe'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
$outputDirectory = Join-Path $gatewayDirectory '.build'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
docker run --rm --entrypoint /bin/bash --label foc.task=envoy-build `
  --mount "type=bind,source=$PSScriptRoot,target=/input,readonly" `
  --mount type=volume,source=foc-envoy-native,target=/workspace `
  --mount "type=bind,source=$outputDirectory,target=/output" `
  $buildImage -c 'bash /input/build.sh'
Check-Exit
