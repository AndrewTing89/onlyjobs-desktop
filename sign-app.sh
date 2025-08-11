#!/bin/bash

echo "Building and signing OnlyJobs Desktop..."

# Clean previous builds
rm -rf dist/

# Build the app with ad-hoc signing
echo "Building with ad-hoc signature..."
npm run dist

# The app is already ad-hoc signed by electron-builder with identity: "-"
# Let's verify the signature
echo ""
echo "Verifying signature..."
codesign -dv --verbose=4 "dist/mac/OnlyJobs Desktop.app" 2>&1 | grep -E "Signature|Authority"

# Check if DMG was created
if [ -f "dist/OnlyJobs Desktop-1.0.0.dmg" ]; then
    mv "dist/OnlyJobs Desktop-1.0.0.dmg" "dist/OnlyJobs-Desktop-Signed.dmg"
    echo ""
    echo "✅ Done! Your signed app is at: dist/OnlyJobs-Desktop-Signed.dmg"
else
    echo "❌ DMG creation failed. Check the build output above."
    exit 1
fi

echo ""
echo "=========================================="
echo "DISTRIBUTION INSTRUCTIONS FOR USERS:"
echo "=========================================="
echo ""
echo "For macOS Sequoia (15.1+) and newer:"
echo "1. Download the .dmg file"
echo "2. Open the DMG and drag app to Applications"
echo "3. Try to open the app (it will be blocked)"
echo "4. Go to System Settings → Privacy & Security"
echo "5. Click 'Open Anyway' button that appears"
echo "6. The app will work normally after that"
echo ""
echo "Alternative Terminal method:"
echo "xattr -cr '/Applications/OnlyJobs Desktop.app'"
echo ""
echo "Note: GitHub Releases is more trusted than SourceForge"
echo "=========================================="