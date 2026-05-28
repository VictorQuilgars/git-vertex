#!/bin/bash
set -e

if [ -z "$GH_TOKEN" ]; then
  echo "❌ GH_TOKEN non défini. Lance : export GH_TOKEN=ton_token"
  exit 1
fi

# Bump patch version in package.json without git tag
npm version patch --no-git-tag-version

VERSION=$(node -p "require('./package.json').version")
echo "🚀 Publication de v$VERSION…"

npm run package -- --mac --publish always

echo "✅ v$VERSION publié sur GitHub"
