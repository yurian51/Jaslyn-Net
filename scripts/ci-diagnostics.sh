#!/usr/bin/env bash
set -Eeuo pipefail

run_step() {
  local name="$1"
  shift
  echo "::group::[NEXORA CI] ${name}"
  echo "[NEXORA CI] START ${name}"
  if "$@"; then
    echo "[NEXORA CI] PASS ${name}"
  else
    code=$?
    echo "[NEXORA CI] FAIL ${name} (exit ${code})"
    echo "::endgroup::"
    exit "$code"
  fi
  echo "::endgroup::"
}

run_step "Install" pnpm install --no-frozen-lockfile
run_step "Migration" pnpm --filter api migrate
run_step "Migration idempotency" pnpm --filter api migrate
run_step "Lint" pnpm lint
run_step "Typecheck" pnpm typecheck
run_step "Test" pnpm test
run_step "Build" pnpm build
