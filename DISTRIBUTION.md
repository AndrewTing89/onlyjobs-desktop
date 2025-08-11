# OnlyJobs Desktop - Distribution Guide

## 🚀 Quick Start for Users

### macOS Installation
1. Download the appropriate version for your Mac:
   - Apple Silicon (M1/M2/M3): `OnlyJobs Desktop-darwin-arm64.zip`
   - Intel Mac: `OnlyJobs Desktop-darwin-x64.zip`

2. Unzip the downloaded file

3. Move "OnlyJobs Desktop.app" to your Applications folder

4. First time launch:
   - Right-click the app and select "Open"
   - Click "Open" when macOS warns about an unidentified developer
   - This is only required for the first launch

### Required Setup
1. **Gmail API Access**: You'll need to configure Gmail API credentials
   - Follow the setup instructions in the app
   - Or provide your own `gmail_credentials.json`

2. **Firebase Configuration**: 
   - The app needs Firebase configuration for authentication
   - Add your Firebase config in Settings

## 📦 For Developers - Building from Source

### Prerequisites
- Node.js v18+
- npm or yarn
- Gmail API credentials

### Build Steps
```bash
# Clone the repository
git clone https://github.com/AndrewTing89/onlyjobs-desktop.git
cd onlyjobs-desktop

# Switch to the latest branch
git checkout ready-for-packaging-v2

# Install dependencies
npm install --legacy-peer-deps

# Download the LLM model
npm run llm:deps
npm run llm:download

# Rebuild native modules for Electron
npm run rebuild:llm

# Package the app
./package-app.sh
```

## 🎯 Features
- **Automatic Gmail Sync**: Connects to your Gmail to find job-related emails
- **Local LLM Classification**: Uses Llama 3.2 3B model for accurate classification
- **Real-time Updates**: See jobs appear instantly during sync
- **Multi-Account Support**: Connect multiple Gmail accounts
- **Privacy-First**: All processing happens locally on your machine
- **Analytics Dashboard**: Track your job application progress

## ⚠️ Known Issues
- **First Launch**: macOS will show security warning (normal for unsigned apps)
- **Large App Size**: ~3.4GB due to included LLM model
- **Model Loading**: Initial classification may take a moment to initialize

## 💾 System Requirements
- **macOS**: 10.13+ (High Sierra or newer)
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 5GB free space
- **Internet**: Required for Gmail sync

## 🔧 Troubleshooting
1. **App won't open**: Right-click and select "Open" to bypass Gatekeeper
2. **Gmail sync issues**: Check your API credentials and internet connection
3. **Classification not working**: Ensure the model file exists in Resources
4. **Performance issues**: Close other heavy applications

## 📄 License
ISC License - See LICENSE file for details