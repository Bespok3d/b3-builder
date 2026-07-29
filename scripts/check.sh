#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (C) 2026 unlucio and the Bespok3d contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

# b3-builder's self-contained gate. A sibling repo carries its OWN gate + steering pack (the daemon is
# the model) so a contributor's LLM is steered by the same rules everywhere, enforced not implied.
#
# The gate (must be green): RULE ZERO (the em / en-dash ban), eslint, a TypeScript typecheck over src
# AND test, a real emit build, the golden-equivalence rail (vitest): stage 2 ported the core's
# pack + index steps, so the rail is no longer a reported-only status, it is must-pass like everything
# else here, and per-file REUSE licensing compliance.

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

if [ ! -d node_modules ]; then
  echo "Installing dependencies (npm install)..."
  npm install
fi

PASS=0
FAIL=0
FAILURES=""

run_check() {
  label="$1"
  shift
  printf "  %-24s" "$label"
  if "$@" > /tmp/b3builder_check_out 2>&1; then
    echo "ok"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    FAIL=$((FAIL + 1))
    FAILURES="$FAILURES\n--- $label ---\n$(cat /tmp/b3builder_check_out)\n"
  fi
}

skip_check() {
  label="$1"
  reason="$2"
  printf "  %-24s" "$label"
  echo "skipped ($reason)"
}

# Per-file REUSE compliance: every file is covered by a copyright and licence statement, its own header
# or the REUSE.toml block, and every licence a file names has its text in LICENSES/. The file list is
# tracked plus not-yet-committed files, so a newly added file is checked before it is committed rather
# than after, and a not-yet-committed rename does not point the linter at a path that no longer exists.
# `reuse` is not a dependency of this repo: an installed one is used when present, otherwise uv runs it
# from cache, and a machine with neither reports the check as skipped rather than as passed.
run_reuse_lint() {
  if command -v reuse > /dev/null 2>&1; then
    reuse "$@"
  else
    uvx --quiet --from 'reuse[charset-normalizer]' reuse "$@"
  fi
}

reuse_per_file_check() {
  local licensed_paths=()
  local candidate_path
  local licensed_count=0
  while IFS= read -r -d '' candidate_path; do
    if [ -f "$candidate_path" ]; then
      licensed_paths+=("$candidate_path")
      licensed_count=$((licensed_count + 1))
    fi
  done < <(git ls-files -z --cached --others --exclude-standard)
  if [ "$licensed_count" -eq 0 ]; then
    return 0
  fi
  run_reuse_lint lint-file "${licensed_paths[@]}"
}

echo "b3-builder gate (node $(node --version))"
run_check "RULE ZERO dash ban"     node scripts/rule-zero-guard.mjs
run_check "eslint"                 npx --no-install eslint .
run_check "typecheck"              npx --no-install tsc --noEmit
run_check "build"                  npx --no-install tsc -p tsconfig.build.json
run_check "equivalence rail"       npx --no-install vitest run

if command -v reuse > /dev/null 2>&1 || command -v uvx > /dev/null 2>&1; then
  run_check "reuse (per-file)" reuse_per_file_check
else
  skip_check "reuse (per-file)" "install reuse, or install uv so it can be run from cache"
fi

echo ""
echo "  $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ]; then
  printf "%b" "$FAILURES" >&2
  exit 1
fi
