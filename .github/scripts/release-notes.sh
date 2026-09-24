#!/usr/bin/env bash
# Print the CHANGELOG section for the current version.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

version="${1:-$(node -p "require('./package.json').version")}"

notes=$(awk -v heading="## ${version}" '
  $0 == heading { found = 1; next }
  found && /^## / { exit }
  found { print }
' CHANGELOG.md)

[ -n "$(printf '%s' "$notes" | tr -d '[:space:]')" ] ||
  { echo "::error::no CHANGELOG section for ${version}"; exit 1; }

printf '%s\n' "$notes" | sed -e '/./,$!d'
