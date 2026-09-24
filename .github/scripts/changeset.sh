#!/usr/bin/env bash
# Inspect and consume changesets.
#   status  - list pending changesets and the version they would produce
#   version - apply them, printing the resulting version on the last line
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

current_version() { node -p "require('./package.json').version"; }

pending() { git ls-files '.changeset/*.md' | grep -v '^.changeset/README.md$' || true; }

case "${1:-status}" in
  status)
    files=$(pending)
    if [ -z "$files" ]; then
      echo "0 changeset(s): $(current_version) -> no release"
      exit 0
    fi
    count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
    out=$(mktemp)
    trap 'rm -f "$out"' EXIT
    pnpm exec changeset status --output="$out" >/dev/null
    next=$(node -e '
      const { readFileSync } = require("node:fs");
      const r = JSON.parse(readFileSync(process.argv[1], "utf8")).releases?.[0];
      process.stdout.write(r ? r.newVersion : "");
    ' "$out")
    [ -n "$next" ] || { echo "::error::could not determine the next version"; exit 1; }
    printf '%s\n' "$files"
    echo "${count} changeset(s): $(current_version) -> ${next}"
    ;;
  version)
    [ -n "$(pending)" ] || { echo "::error::no pending changesets" >&2; exit 1; }
    pnpm run version
    current_version
    ;;
  *)
    echo "usage: changeset.sh [status|version]" >&2
    exit 1
    ;;
esac
