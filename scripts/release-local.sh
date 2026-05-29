#!/bin/bash
set -e

if [ -z "$GH_TOKEN" ]; then
  echo "❌ GH_TOKEN non défini. Lance : export GH_TOKEN=ton_token"
  exit 1
fi

# Derive next patch version from the latest git tag (e.g. v1.1.13 -> 1.1.14)
LATEST_TAG=$(git tag --sort=-version:refname | grep '^v' | head -1 | sed 's/v//')
if [ -z "$LATEST_TAG" ]; then
  echo "❌ Aucun tag trouvé"
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$LATEST_TAG"
NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"

echo "📦 $LATEST_TAG → $NEW_VERSION"

# Bump version in package.json, commit and tag
npm version "$NEW_VERSION" --no-git-tag-version
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"
git push origin main
git push origin "v$NEW_VERSION"

echo "🚀 Publication de v$NEW_VERSION…"

# macOS (toujours)
npm run package -- --mac --publish always

# Windows — nécessite wine sur macOS
if command -v wine &>/dev/null; then
  echo "🪟 Wine détecté, build Windows…"
  npm run package -- --win --publish always
else
  echo "⚠️  Wine non trouvé — build Windows ignoré en local."
  echo "   Le CI GitHub Actions build Windows automatiquement via le tag v$NEW_VERSION."
  echo "   Pour builder en local : brew install --cask wine-stable"
fi

echo "✅ v$NEW_VERSION publié sur GitHub"

# Clean up local build artifacts
rm -rf dist/
echo "🧹 Dossier dist/ nettoyé"
