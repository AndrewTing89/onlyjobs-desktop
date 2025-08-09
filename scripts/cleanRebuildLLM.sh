#!/usr/bin/env bash
set -euo pipefail

echo "🧹 Clean rebuild of node-llama-cpp for Electron"
echo "=============================================="

# Remove existing build directory
if [ -d "node_modules/node-llama-cpp/build" ]; then
  echo "🗑️ Removing existing build directory..."
  rm -rf node_modules/node-llama-cpp/build
fi

# Get Electron version
ELECTRON_VERSION=$(npx -y electron --version | sed 's/v//')
echo "🔧 Electron version: $ELECTRON_VERSION"

# Clean rebuild with Electron target
echo "🔨 Rebuilding node-llama-cpp from source for Electron..."
npm rebuild node-llama-cpp --build-from-source \
  --runtime=electron \
  --target="$ELECTRON_VERSION" \
  --dist-url=https://electronjs.org/headers

echo "✅ Clean rebuild complete!"