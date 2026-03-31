#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
  echo "Usage: npm run version <new-version>"
  echo "Example: npm run version 1.1.12"
  exit 1
fi

VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Bumping to $VERSION..."

# 1. package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"

# 2. .claude-plugin/plugin.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/.claude-plugin/plugin.json"

# 3. .claude-plugin/marketplace.json (two version fields: metadata + plugin entry)
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/g" "$ROOT/.claude-plugin/marketplace.json"

# 4 & 5. src/index.ts — Server constructor version + check_access response version
sed -i '' "s/version: \"[0-9]*\.[0-9]*\.[0-9]*\"/version: \"$VERSION\"/g" "$ROOT/src/index.ts"

# Rebuild dist
echo "Building..."
cd "$ROOT" && npm run build

# Commit and push
git add \
  "$ROOT/package.json" \
  "$ROOT/.claude-plugin/plugin.json" \
  "$ROOT/.claude-plugin/marketplace.json" \
  "$ROOT/src/index.ts" \
  "$ROOT/dist/index.cjs" \
  "$ROOT/dist/native-messaging-host.cjs" \
  "$ROOT/dist/install-native-host.cjs"

git commit -m "Bump version to $VERSION

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push

echo "Done — version is now $VERSION"
