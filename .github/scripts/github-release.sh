#!/usr/bin/env bash
# Tag the release commit and publish the GitHub release. Safe to re-run.
# Expects TAG, DRAFT and GITHUB_TOKEN in the environment.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

: "${TAG:?tag}"

if ! git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git tag -a "$TAG" -m "$TAG"
  git push origin "$TAG"
fi

args=(--title "$TAG" --notes-file RELEASE_NOTES.md)
[ "${DRAFT:-false}" = true ] && args+=(--draft)

gh release view "$TAG" >/dev/null 2>&1 || gh release create "$TAG" "${args[@]}"
