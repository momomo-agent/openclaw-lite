#!/bin/bash
# Paw DMG 签名 + 公证 + staple 一键脚本
# 用法: bash scripts/notarize-dmg.sh [dmg路径]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VERSION=$(node -p "require('$PROJECT_DIR/package.json').version")
DMG="${1:-$PROJECT_DIR/dist/Paw-${VERSION}-arm64.dmg}"
IDENTITY="Developer ID Application: Kenefe Li (P2GN9QW8E5)"
APPLE_ID="kenefe.li@gmail.com"
TEAM_ID="P2GN9QW8E5"
APP_PASSWORD="brbs-falh-njra-emwk"

if [ ! -f "$DMG" ]; then
  echo "❌ DMG not found: $DMG"
  exit 1
fi

echo "📦 DMG: $DMG"
echo "📏 Size: $(du -h "$DMG" | cut -f1)"

# 签名
echo "🔏 Signing DMG..."
codesign --sign "$IDENTITY" --timestamp --options runtime --deep --force "$DMG"
echo "✅ Signed"

# 公证
echo "📤 Submitting for notarization..."
xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" \
  --team-id "$TEAM_ID" \
  --password "$APP_PASSWORD" \
  --wait

# Staple
echo "📎 Stapling..."
xcrun stapler staple "$DMG"
echo "✅ Done! DMG is signed, notarized, and stapled."
