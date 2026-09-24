#!/usr/bin/env bash
# Open or update the pull request that syncs the release commit back into main.
# Expects BRANCH, TAG, REPO and GITHUB_TOKEN in the environment.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

: "${BRANCH:?branch}" "${TAG:?tag}" "${REPO:?repo}"

# shellcheck disable=SC2016 # backticks in the body are Markdown, not command substitution
{
  cat RELEASE_NOTES.md
  printf '\n---\n\n'
  printf 'Post-release sync — version bump, changelog, and consumed changesets for '
  printf '**%s**, already published at https://github.com/%s/releases/tag/%s.\n\n' \
    "$TAG" "$REPO" "$TAG"
  printf 'Merge (do not squash) to keep the tagged commit reachable from `main`.\n'
} > body.md

existing=$(gh pr list --head "$BRANCH" --base main --state open --json number --jq '.[0].number')
if [ -n "$existing" ]; then
  gh pr edit "$existing" --title "chore(release): ${TAG}" --body-file body.md
else
  gh pr create --base main --head "$BRANCH" \
    --title "chore(release): ${TAG}" --body-file body.md
fi
