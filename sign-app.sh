#\!/bin/bash

# Exit on any error
set -e

echo "OnlyJobs Desktop - Signing Script"
echo "================================="

# Clean up old builds
echo "1. Cleaning up old builds..."
rm -rf "dist/OnlyJobs Desktop-darwin-arm64"

# Remove all extended attributes from source
echo "2. Removing extended attributes from source..."
xattr -cr .

# Package the app
echo "3. Packaging the app..."
npx electron-packager . "OnlyJobs Desktop" --platform=darwin --arch=arm64 --out=dist --overwrite --no-prune

# Remove extended attributes from the packaged app
echo "4. Removing extended attributes from packaged app..."
xattr -cr "dist/OnlyJobs Desktop-darwin-arm64/OnlyJobs Desktop.app"

# Sign the app
echo "5. Signing the app..."
codesign --force --deep --sign "Developer ID Application: Andrew Ting (NGANSYMPNR)" --options runtime --timestamp "dist/OnlyJobs Desktop-darwin-arm64/OnlyJobs Desktop.app"

# Verify the signature
echo "6. Verifying signature..."
codesign --verify --deep --strict --verbose=2 "dist/OnlyJobs Desktop-darwin-arm64/OnlyJobs Desktop.app"

echo ""
echo "✅ App signed successfully\!"
echo "Location: dist/OnlyJobs Desktop-darwin-arm64/OnlyJobs Desktop.app"
EOF < /dev/null