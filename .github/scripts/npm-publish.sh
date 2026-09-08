#!/usr/bin/env bash
# Publish the package to npm. Set DRY_RUN=true to rehearse without publishing.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [ "${DRY_RUN:-false}" = true ]; then
  pnpm publish --dry-run --no-git-checks
  exit 0
fi

version=$(node -p "require('./package.json').version")
name=$(node -p "require('./package.json').name")

if npm view "${name}@${version}" version >/dev/null 2>&1; then
  echo "${name}@${version} is already published; skipping"
  exit 0
fi

pnpm publish --no-git-checks --provenance
