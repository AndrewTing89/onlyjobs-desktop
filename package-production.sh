#!/bin/bash

echo "📦 Creating production package for OnlyJobs Desktop..."

# Clean up
rm -rf dist/production-temp
mkdir -p dist/production-temp

# Copy the working app
cp -R "dist/OnlyJobs Desktop-darwin-arm64/OnlyJobs Desktop.app" "dist/production-temp/"

# Clean up unnecessary files from the app
APP_PATH="dist/production-temp/OnlyJobs Desktop.app/Contents/Resources/app"

# Remove development files
rm -rf "$APP_PATH/src"
rm -rf "$APP_PATH/public" 
rm -rf "$APP_PATH/scripts"
rm -rf "$APP_PATH/.git"
rm -rf "$APP_PATH/.gitignore"
rm -rf "$APP_PATH/README.md"
rm -rf "$APP_PATH/*.md"
rm -rf "$APP_PATH/node_modules/.cache"
rm -rf "$APP_PATH/node_modules/electron"
rm -rf "$APP_PATH/ml-classifier"
rm -f "$APP_PATH/models/*.corrupted"

echo "✅ App cleaned and ready"
echo "📏 Final app size:"
du -sh "dist/production-temp/OnlyJobs Desktop.app"

echo "Creating DMG..."
# Create a simple DMG
hdiutil create -fs HFS+ -volname "OnlyJobs Desktop" -srcfolder "dist/production-temp/OnlyJobs Desktop.app" "dist/OnlyJobs-Desktop-1.0.0-FINAL.dmg"

echo "✅ DMG created: dist/OnlyJobs-Desktop-1.0.0-FINAL.dmg"
ls -lh dist/*.dmg