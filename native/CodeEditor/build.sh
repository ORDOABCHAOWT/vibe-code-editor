#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="代码编辑器"
INSTALLED_APP="/Applications/$APP_NAME.app"
PUBLIC_BUNDLE_ID="io.github.ordoabchaowt.codeeditor"
BUNDLE_ID="${APP_BUNDLE_ID:-$PUBLIC_BUNDLE_ID}"
BUILD_DIR="$SCRIPT_DIR/../../dist"
LEGACY_BUILD_DIR="$SCRIPT_DIR/build"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"

# Preserve the identity of an existing local install; fresh public builds use PUBLIC_BUNDLE_ID.
if [[ -z "${APP_BUNDLE_ID:-}" && -f "$INSTALLED_APP/Contents/Info.plist" ]]; then
  EXISTING_BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INSTALLED_APP/Contents/Info.plist" 2>/dev/null || true)"
  if [[ -n "$EXISTING_BUNDLE_ID" ]]; then
    BUNDLE_ID="$EXISTING_BUNDLE_ID"
  fi
fi

echo "=== 清理 ==="
rm -rf "$BUILD_DIR" "$LEGACY_BUILD_DIR"
mkdir -p "$MACOS" "$RESOURCES"

echo "=== 编译 Swift ==="
swiftc \
  -O \
  -whole-module-optimization \
  -import-objc-header /dev/null \
  -framework Cocoa \
  -framework WebKit \
  -o "$MACOS/$APP_NAME" \
  "$SCRIPT_DIR/main.swift"

echo "=== 复制资源 ==="
cp -R "$SCRIPT_DIR/Resources/web" "$RESOURCES/web"

# Icon
ICON_SRC="$SCRIPT_DIR/../../build/icon.icns"
if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$RESOURCES/AppIcon.icns"
  echo "  复制了 icon.icns"
fi

echo "=== 生成 Info.plist ==="
cat > "$CONTENTS/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleVersion</key>
  <string>2.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>2.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSSupportsAutomaticTermination</key>
  <true/>
  <key>NSSupportsSuddenTermination</key>
  <false/>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.developer-tools</string>
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeName</key>
      <string>Folder</string>
      <key>CFBundleTypeRole</key>
      <string>Viewer</string>
      <key>LSItemContentTypes</key>
      <array>
        <string>public.folder</string>
      </array>
    </dict>
    <dict>
      <key>CFBundleTypeName</key>
      <string>Source Code</string>
      <key>CFBundleTypeRole</key>
      <string>Editor</string>
      <key>LSItemContentTypes</key>
      <array>
        <string>public.source-code</string>
        <string>public.plain-text</string>
        <string>public.text</string>
      </array>
    </dict>
  </array>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
PLIST

echo "=== 签名 ==="
/usr/bin/codesign --force --deep --sign - "$APP_DIR"
/usr/bin/codesign --verify --deep --strict "$APP_DIR"

echo "=== 完成 ==="
du -sh "$APP_DIR"
echo "App built at: $APP_DIR"
