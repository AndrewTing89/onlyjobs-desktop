#!/bin/bash

echo "🚀 OnlyJobs Desktop Setup"
echo "========================"

# Check Node.js
echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    echo "✓ ($(node -v))"
else
    echo "✗ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Install npm dependencies
echo ""
echo "📦 Installing npm dependencies..."
npm install

# Download LLM model if not present
echo ""
echo "🤖 Checking for LLM model..."
if [ ! -f models/model.gguf ]; then
    echo "📥 LLM model not found. You can download one using:"
    echo "   npm run llm:download"
    echo "   This will download a compatible GGUF model for email classification."
else
    echo "✓ LLM model found"
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cat > .env << EOL
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://127.0.0.1:8000

# Add your credentials above
EOL
    echo "✓ Created .env file - Please add your Google OAuth credentials"
fi

# Create directories if they don't exist
echo ""
echo "📁 Creating required directories..."
mkdir -p assets

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your Google OAuth credentials to .env file"
echo "2. Download Gmail API credentials from Google Cloud Console"
echo "3. Download LLM model: npm run llm:download (if not already present)"
echo "4. Run the app: npm run dev"
echo ""
echo "Happy job hunting! 🎯"