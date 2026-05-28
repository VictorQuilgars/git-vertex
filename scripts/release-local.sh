#!/bin/bash
set -e

if [ -z "$GH_TOKEN" ]; then
  echo "❌ GH_TOKEN non défini. Lance : export GH_TOKEN=ton_token"
  exit 1
fi

# Derive next patch version from the latest git tag (e.g. v1.1.8 -> 1.1.9)
LATEST_TAG=$(git tag --sort=-version:refname | grep '^v' | head -1 | sed 's/v//')
if [ -z "$LATEST_TAG" ]; then
  echo "❌ Aucun tag trouvé"
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$LATEST_TAG"
NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"

npm version "$NEW_VERSION" --no-git-tag-version
echo "🚀 Publication de v$NEW_VERSION (base: v$LATEST_TAG)…"

npm run package -- --mac --publish always

echo "✅ v$NEW_VERSION publié sur GitHub"
