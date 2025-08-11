#!/bin/bash

echo "🚀 Building and signing OnlyJobs Desktop..."

# Use the mirror for faster downloads
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# Build React app
echo "📦 Building React app..."
npm run build

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Package using electron-packager (faster, more reliable)
echo "📱 Packaging for macOS (Universal)..."
npx electron-packager . "OnlyJobs Desktop" \
  --platform=darwin \
  --arch=universal \
  --out=dist \
  --overwrite \
  --asar \
  --icon=assets/icon.icns \
  --ignore="^/src$" \
  --ignore="^/public$" \
  --ignore="^/.git$" \
  --ignore="^/\\.env$" \
  --ignore="^/\\.env\\.backup$"

# Ad-hoc sign the app
echo ""
echo "✍️ Applying ad-hoc signature..."
codesign --force --deep --sign - "dist/OnlyJobs Desktop-darwin-universal/OnlyJobs Desktop.app"

# Verify signature
echo ""
echo "🔍 Verifying signature..."
codesign -dv --verbose=2 "dist/OnlyJobs Desktop-darwin-universal/OnlyJobs Desktop.app" 2>&1 | grep -E "Signature|Authority|signed"

# Create DMG
echo ""
echo "💿 Creating DMG..."
npx electron-installer-dmg \
  "dist/OnlyJobs Desktop-darwin-universal/OnlyJobs Desktop.app" \
  "OnlyJobs-Desktop" \
  --out=dist/ \
  --overwrite \
  --icon=assets/icon.icns

# Sign the DMG
echo ""
echo "✍️ Signing DMG..."
codesign --force --sign - "dist/OnlyJobs-Desktop.dmg"

echo ""
echo "✅ Build complete!"
echo "📁 Signed DMG: dist/OnlyJobs-Desktop.dmg"
echo ""
echo "=========================================="
echo "DISTRIBUTION INSTRUCTIONS:"
echo "=========================================="
echo "1. Upload to GitHub Releases (recommended)"
echo "2. Users download the DMG"
echo "3. First time opening:"
echo "   - Try to open (will be blocked)"
echo "   - System Settings → Privacy & Security"
echo "   - Click 'Open Anyway'"
echo "==========================================