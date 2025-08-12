#!/bin/bash

# OnlyJobs Desktop Windows Packaging Script
# This script packages the app for Windows using electron-packager

echo "🚀 Starting OnlyJobs Desktop Windows packaging..."

# Build the React app first
echo "📦 Building React app..."
npm run build

# Clean previous builds
echo "🧹 Cleaning previous Windows builds..."
rm -rf dist/*win*

# Package for Windows x64
echo "💻 Packaging for Windows x64..."
npx electron-packager . "OnlyJobs Desktop" \
  --platform=win32 \
  --arch=x64 \
  --out=dist \
  --overwrite \
  --asar \
  --icon=assets/icon.ico \
  --ignore="^/src$" \
  --ignore="^/public$" \
  --ignore="^/.git$" \
  --ignore="^/\\.env$" \
  --ignore="^/\\.env\\.backup$" \
  --ignore="^/ml-classifier$"

# Package for Windows ARM64 (for Surface Pro X, etc.)
echo "📱 Packaging for Windows ARM64..."
npx electron-packager . "OnlyJobs Desktop" \
  --platform=win32 \
  --arch=arm64 \
  --out=dist \
  --overwrite \
  --asar \
  --icon=assets/icon.ico \
  --ignore="^/src$" \
  --ignore="^/public$" \
  --ignore="^/.git$" \
  --ignore="^/\\.env$" \
  --ignore="^/\\.env\\.backup$" \
  --ignore="^/ml-classifier$"

echo "✅ Windows packaging complete!"
echo "📁 Output location: dist/"
echo ""
echo "To create installer:"
echo "  Consider using electron-builder or NSIS for .exe installer"
echo ""
echo "Packaged apps:"
echo "  x64:   dist/OnlyJobs Desktop-win32-x64/"
echo "  ARM64: dist/OnlyJobs Desktop-win32-arm64/"