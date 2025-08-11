#!/bin/bash

# OnlyJobs Desktop Packaging Script
# This script packages the app for macOS using electron-packager

echo "🚀 Starting OnlyJobs Desktop packaging..."

# Build the React app first
echo "📦 Building React app..."
npm run build

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Package for macOS ARM64 (Apple Silicon)
echo "📱 Packaging for macOS ARM64..."
npx electron-packager . "OnlyJobs Desktop" \
  --platform=darwin \
  --arch=arm64 \
  --out=dist \
  --overwrite \
  --asar \
  --icon=assets/icon.icns \
  --ignore="^/src$" \
  --ignore="^/public$" \
  --ignore="^/.git$" \
  --ignore="^/\\.env$" \
  --ignore="^/\\.env\\.backup$"

# Package for macOS x64 (Intel)
echo "💻 Packaging for macOS x64..."
npx electron-packager . "OnlyJobs Desktop" \
  --platform=darwin \
  --arch=x64 \
  --out=dist \
  --overwrite \
  --asar \
  --icon=assets/icon.icns \
  --ignore="^/src$" \
  --ignore="^/public$" \
  --ignore="^/.git$" \
  --ignore="^/\\.env$" \
  --ignore="^/\\.env\\.backup$"

echo "✅ Packaging complete!"
echo "📁 Output location: dist/"
echo ""
echo "To run the app:"
echo "  ARM64: open 'dist/OnlyJobs Desktop-darwin-arm64/OnlyJobs Desktop.app'"
echo "  x64:   open 'dist/OnlyJobs Desktop-darwin-x64/OnlyJobs Desktop.app'"