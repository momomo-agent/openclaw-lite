#!/bin/bash
# release.sh — Paw 一键发版
# 用法: scripts/release.sh [patch|minor|major] "release notes"
# 默认: patch
set -e
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
NOTES="${2:-}"

# 1. Bump version
OLD_VERSION=$(node -p "require('./package.json').version")
if [ "$BUMP" = "patch" ]; then
  NEW_VERSION=$(node -p "const v='$OLD_VERSION'.split('.'); v[2]=+v[2]+1; v.join('.')")
elif [ "$BUMP" = "minor" ]; then
  NEW_VERSION=$(node -p "const v='$OLD_VERSION'.split('.'); v[1]=+v[1]+1; v[2]=0; v.join('.')")
elif [ "$BUMP" = "major" ]; then
  NEW_VERSION=$(node -p "const v='$OLD_VERSION'.split('.'); v[0]=+v[0]+1; v[1]=0; v[2]=0; v.join('.')")
else
  NEW_VERSION="$BUMP"
fi

echo "📦 Bumping $OLD_VERSION → $NEW_VERSION"
sed -i '' "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# 2. Update website version
sed -i '' "s/v${OLD_VERSION}/v${NEW_VERSION}/g" docs/index.html
echo "🌐 Updated docs/index.html"

# 3. Git commit + tag
git add -A
git commit -m "release: v${NEW_VERSION}"
git tag "v${NEW_VERSION}"
echo "🏷️  Tagged v${NEW_VERSION}"

# 4. Build app (skip code signing, we'll sign manually)
echo "🔨 Building..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir

APP="dist/mac-arm64/Paw.app"
if [ ! -d "$APP" ]; then
  echo "❌ Build failed: $APP not found"
  exit 1
fi

# 5. Sign with Developer ID (must sign all native binaries individually with entitlements)
IDENTITY="Developer ID Application: Kenefe Li (P2GN9QW8E5)"
ENT="scripts/entitlements.plist"
ENTC="scripts/entitlements-child.plist"

echo "🔏 Signing native binaries in app.asar.unpacked..."
find "$APP/Contents/Resources/app.asar.unpacked" -type f \( -name "*.node" -o -name "*.dylib" -o -name "*.so" \) -exec \
  codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" {} \;

echo "🔏 Signing vendored executables (ripgrep, etc)..."
find "$APP/Contents/Resources/app.asar.unpacked" -type f -perm +111 \
  ! -name "*.js" ! -name "*.json" ! -name "*.md" ! -name "*.txt" ! -name "*.ts" ! -name "*.mjs" ! -name "*.cjs" \
  ! -name "*.node" ! -name "*.dylib" ! -name "*.so" -exec \
  codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" {} \;

echo "🔏 Signing Electron Framework Libraries..."
find "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries" -type f -name "*.dylib" -exec \
  codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" {} \;

echo "🔏 Signing Squirrel dependencies (Mantle, ReactiveObjC)..."
codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/Mantle.framework/Versions/A/Mantle"
codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/Mantle.framework"
codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/ReactiveObjC.framework/Versions/A/ReactiveObjC"
codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/ReactiveObjC.framework"

echo "🔏 Signing Squirrel ShipIt..."
codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"

echo "🔏 Signing Electron Framework + crashpad..."
codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler"
codesign --force --options runtime --timestamp --entitlements "$ENT" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
codesign --force --options runtime --timestamp --entitlements "$ENT" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/Electron Framework.framework"
codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" \
  "$APP/Contents/Frameworks/Squirrel.framework"

echo "🔏 Signing Helpers..."
for helper in "$APP/Contents/Frameworks/"*Helper*.app; do
  codesign --force --options runtime --timestamp --entitlements "$ENTC" --sign "$IDENTITY" "$helper"
done

echo "🔏 Signing Main App..."
codesign --force --options runtime --timestamp --entitlements "$ENT" --sign "$IDENTITY" "$APP"

echo "✅ Verifying signature..."
codesign --verify --deep --strict --verbose=1 "$APP"

echo "🧪 Testing launch..."
"$APP/Contents/MacOS/Paw" &
TEST_PID=$!
sleep 5
if kill -0 $TEST_PID 2>/dev/null; then
  echo "✅ App launches successfully"
  kill $TEST_PID
else
  echo "❌ App failed to launch"
  exit 1
fi

# 6. Create DMG
DMG="dist/Paw-${NEW_VERSION}-arm64.dmg"
rm -f "$DMG"
echo "💿 Creating DMG..."
hdiutil create -volname "Paw" -srcfolder "$APP" -ov -format UDZO "$DMG"

# 7. Notarize + staple
echo "🍎 Notarizing..."
xcrun notarytool submit "$DMG" --keychain-profile "notarytool" --wait
if [ $? -ne 0 ]; then
  echo "❌ Notarization failed"
  exit 1
fi

echo "📎 Stapling..."
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"

echo "🧪 Testing DMG install..."
hdiutil attach "$DMG" -nobrowse -mountpoint /tmp/paw-release-test
cp -R /tmp/paw-release-test/Paw.app /tmp/Paw-release-test.app
hdiutil detach /tmp/paw-release-test
/tmp/Paw-release-test.app/Contents/MacOS/Paw &
DMG_TEST_PID=$!
sleep 5
if kill -0 $DMG_TEST_PID 2>/dev/null; then
  echo "✅ DMG install + launch OK"
  kill $DMG_TEST_PID
  rm -rf /tmp/Paw-release-test.app
else
  echo "❌ DMG launch failed"
  rm -rf /tmp/Paw-release-test.app
  exit 1
fi

# 8. Push to GitHub
echo "🚀 Pushing..."
git push origin main
git push origin "v${NEW_VERSION}"

# 9. Create GitHub Release
echo "📋 Creating GitHub Release..."
if [ -n "$NOTES" ]; then
  gh release create "v${NEW_VERSION}" \
    --title "Paw v${NEW_VERSION}" \
    --notes "$NOTES" \
    "$DMG"
else
  gh release create "v${NEW_VERSION}" \
    --title "Paw v${NEW_VERSION}" \
    --generate-notes \
    "$DMG"
fi

RELEASE_URL="https://github.com/momomo-agent/paw/releases/tag/v${NEW_VERSION}"
echo ""
echo "✅ Paw v${NEW_VERSION} released!"
echo "📥 $RELEASE_URL"
