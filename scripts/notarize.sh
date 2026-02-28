#!/bin/bash
# notarize.sh — 公证 Paw DMG
# 用法: scripts/notarize.sh [dmg路径]
# 默认: dist/Paw-{version}-arm64.dmg

set -e

VERSION=$(node -p "require('./package.json').version")
DMG="${1:-dist/Paw-${VERSION}-arm64.dmg}"

if [ ! -f "$DMG" ]; then
  echo "❌ DMG not found: $DMG"
  exit 1
fi

echo "🍎 Notarizing: $DMG"
xcrun notarytool submit "$DMG" --keychain-profile "notarytool" --wait

echo "📎 Stapling..."
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"

echo "✅ Done: $DMG"
