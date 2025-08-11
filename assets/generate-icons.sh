#!/bin/bash

# Script to generate app icons from a base PNG
# Requires ImageMagick to be installed

if ! command -v convert &> /dev/null; then
    echo "ImageMagick is required but not installed."
    echo "Install with: brew install imagemagick"
    exit 1
fi

BASE_ICON="assets/icon.png"

if [ ! -f "$BASE_ICON" ]; then
    echo "Base icon not found at $BASE_ICON"
    exit 1
fi

echo "Generating macOS icon set..."
# Create icon.iconset directory
mkdir -p assets/icon.iconset

# Generate different sizes for macOS
convert "$BASE_ICON" -resize 16x16 assets/icon.iconset/icon_16x16.png
convert "$BASE_ICON" -resize 32x32 assets/icon.iconset/icon_16x16@2x.png
convert "$BASE_ICON" -resize 32x32 assets/icon.iconset/icon_32x32.png
convert "$BASE_ICON" -resize 64x64 assets/icon.iconset/icon_32x32@2x.png
convert "$BASE_ICON" -resize 128x128 assets/icon.iconset/icon_128x128.png
convert "$BASE_ICON" -resize 256x256 assets/icon.iconset/icon_128x128@2x.png
convert "$BASE_ICON" -resize 256x256 assets/icon.iconset/icon_256x256.png
convert "$BASE_ICON" -resize 512x512 assets/icon.iconset/icon_256x256@2x.png
convert "$BASE_ICON" -resize 512x512 assets/icon.iconset/icon_512x512.png
convert "$BASE_ICON" -resize 1024x1024 assets/icon.iconset/icon_512x512@2x.png

# Create .icns file
iconutil -c icns assets/icon.iconset -o assets/icon.icns
rm -rf assets/icon.iconset

echo "✅ Created icon.icns for macOS"

# Generate Windows .ico
convert "$BASE_ICON" -resize 16x16 -resize 32x32 -resize 48x48 -resize 64x64 -resize 128x128 -resize 256x256 assets/icon.ico

echo "✅ Created icon.ico for Windows"
echo "✅ All icons generated successfully!"