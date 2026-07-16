#!/usr/bin/env bash
set -euo pipefail

# b3-builder's self-contained gate. A sibling repo carries its OWN gate + steering pack (the daemon is
# the model) so a contributor's LLM is steered by the same rules everywhere, enforced not implied.
#
# The gate (must be green): RULE ZERO (the em / en-dash ban), eslint, a TypeScript typecheck over src
# AND test, a real emit build, and the golden-equivalence rail (vitest): packet 2 ported the core's
# pack + index steps, so the rail is no longer a reported-only status, it is must-pass like everything
# else here.

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

echo "b3-builder gate (node $(node --version))"
run_check "RULE ZERO dash ban"     node scripts/rule-zero-guard.mjs
run_check "eslint"                 npx --no-install eslint .
run_check "typecheck"              npx --no-install tsc --noEmit
run_check "build"                  npx --no-install tsc -p tsconfig.build.json
run_check "equivalence rail"       npx --no-install vitest run

echo ""
echo "  $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ]; then
  printf "%b" "$FAILURES" >&2
  exit 1
fi
