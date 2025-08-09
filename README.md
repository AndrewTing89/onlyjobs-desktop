# OnlyJobs Desktop

An AI-powered job application tracking desktop app that automatically syncs with Gmail, classifies job-related emails using machine learning, and provides real-time analytics.

[![Electron](https://img.shields.io/badge/Electron-37-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?logo=python)](https://www.python.org/)
[![ML Powered](https://img.shields.io/badge/ML-scikit--learn-F7931E?logo=scikit-learn)](https://scikit-learn.org/)

## Features

- 🔐 **Gmail Integration**: Secure OAuth 2.0 authentication with Gmail
- 🤖 **AI Classification**: Automatically identifies and classifies job-related emails
- 📊 **Real-time Dashboard**: Track your job applications with live updates
- 🔄 **Multi-Account Support**: Connect multiple Gmail accounts
- 💾 **Local Storage**: All data stored locally using SQLite
- 🎯 **Smart Extraction**: Extracts company names, positions, and application dates

## Prerequisites

- Node.js (v18 or higher)
- Python 3.8+
- Gmail account
- Google Cloud Platform project with Gmail API enabled

## Local LLM Mode (Preview)

The app supports a local LLM provider for enhanced email classification in Electron mode only. The default provider is "keyword" so web builds work unchanged. 

- **Default Model**: Llama-3.2-3B-Instruct Q4_K_M (lightweight, CPU-optimized)
- **Model Path**: `./models/model.gguf`
- **Provider Toggle**: Set `CLASSIFIER_PROVIDER=llm` in `.env`
- **Setup Commands**:
  - `npm run llm:deps` - Install node-llama-cpp dependencies
  - `npm run llm:download` - Download the model file
  - `npm run llm:test` - Test LLM classification with sample emails (runs under Electron)
  - `npm run llm:normalize -- --dry-run` - Preview normalization changes to existing job records
  - `npm run llm:normalize` - Apply normalization improvements to existing database records
- **Performance Features**:
  - **Streaming Early Stop**: Terminates LLM generation as soon as complete JSON is detected (30-60% latency reduction)
  - **Single-shot Prompts**: Uses plain-string prompts instead of chat arrays for faster inference
  - **Prefilter**: Skips LLM for obvious non-job emails using regex matching
  - **Caching**: Results cached for 7 days (configurable TTL) for faster repeated classification  
  - **Timeout Protection**: Falls back to keyword classifier after 15s timeout
  - **Content Truncation**: Long emails truncated to 5000 chars (preserves header/footer)
  - **Concurrency Control**: Limits concurrent LLM requests to prevent resource exhaustion
- **Configuration**:
  - `ONLYJOBS_ENABLE_PREFILTER=1` - Enable/disable regex prefilter
  - `ONLYJOBS_INFER_TIMEOUT_MS=15000` - LLM inference timeout in milliseconds
  - `ONLYJOBS_EARLY_STOP_JSON=1` - Enable streaming early-stop for faster JSON completion
  - `ONLYJOBS_CACHE_TTL_HOURS=168` - Cache expiration (7 days default)
  - `ONLYJOBS_INFER_MAX_CHARS=5000` - Max email length before truncation
- **Database Normalization**:
  - Auto-detects database location in platform-specific userData directories
  - Custom path: `npm run llm:normalize -- --db="/path/to/jobs.db"`
  - Environment: `ONLYJOBS_DB_PATH="/path/to/jobs.db" npm run llm:normalize`
  - Re-applies subject-first extraction, vendor heuristics, and sanitizers to existing records
- **Troubleshooting**:
  - `npm run diagnose:native` - Diagnose native module loading issues
  - `npm run rebuild:llm` - Rebuild native modules for Electron
  - `npm run rebuild:llm:clean` - Clean rebuild from source if standard rebuild fails
  - Apple Silicon: Set `export LLAMA_METAL=1` and tune `ONLYJOBS_N_GPU_LAYERS` (e.g., 10)
  - If module keys are empty or `_llama` undefined:
    1. Try `npm run rebuild:llm`
    2. If still failing: `npm run rebuild:llm:clean`
- **Important**: 
  - Native modules are rebuilt for Electron, so manual tests MUST run under Electron with `ELECTRON_RUN_AS_NODE=1`
  - `node-llama-cpp` must never be imported in renderer/web code - Electron main process only

## Installation

1. Clone the repository (including the ML classifier submodule):
```bash
git clone --recurse-submodules https://github.com/yourusername/onlyjobs-desktop.git
cd onlyjobs-desktop
# if you already cloned without submodules
git submodule update --init --recursive
```

2. Install dependencies:
```bash
npm install
```

3. Install Python dependencies for the ML classifier:
```bash
cd ml-classifier
pip install -r requirements.txt
cd ..
```

4. Add configuration files:
   - Place `gmail_credentials.json` in the project root (downloaded from Google Cloud Console).
   - Create a `.env` file in the project root with values for:
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET`
     - `GOOGLE_REDIRECT_URI`
     - any `REACT_APP_*` Firebase variables required by the React app
   - Create `electron/.env` with:
     - `GOOGLE_OAUTH_CLIENT_ID`
     - `GOOGLE_OAUTH_CLIENT_SECRET`
     - `GOOGLE_OAUTH_REDIRECT_URI`

5. (Optional) Run the setup script to install all dependencies automatically:
```bash
bash setup.sh
```

## Running the App

### Development Mode

Start both React and Electron in development mode:

```bash
# Terminal 1 - Start React dev server
npm start

# Terminal 2 - Start Electron
npm run electron-dev
```

### Production Build

```bash
# Build React app
npm run build

# Package Electron app
npm run electron-pack
```

## Testing

Run the Jest test suite:

```bash
npm test
```

## Project Structure

```
onlyjobs-desktop/
├── electron/           # Electron main process files
│   ├── main.js        # Main entry point
│   ├── ipc-handlers.js # IPC communication handlers
│   ├── gmail-auth.js  # Gmail authentication
│   └── gmail-multi-auth.js # Multi-account support
├── src/               # React app source
│   ├── components/    # React components
│   ├── pages/        # Page components
│   └── ElectronApp.tsx # Main Electron app component
├── ml-classifier/     # Python ML classifier
│   ├── scripts/      # Classification scripts
│   └── data/models/  # Trained ML models
└── public/           # Static assets
```

## Key Technologies

- **Frontend**: React 19, TypeScript, Material-UI
- **Desktop**: Electron 37
- **Database**: SQLite3 (better-sqlite3)
- **ML**: Python, scikit-learn
- **Authentication**: Google OAuth 2.0 (AppAuth-JS)

## Development Notes

### Gmail Sync Process

1. **Fetch Stage**: Downloads emails from Gmail with full content
2. **Classification Stage**: Processes emails through ML classifier
3. **Storage**: Saves job-related emails to local SQLite database

### Database Schema

The app uses SQLite with the following main tables:
- `emails`: Stores all fetched emails
- `jobs`: Stores classified job applications
- `gmail_accounts`: Manages multiple Gmail accounts
- `sync_status`: Tracks sync progress

### ML Classification

The classifier uses a trained model to identify job-related emails based on:
- Email content and structure
- Keywords and patterns
- Sender information
- Subject line analysis

## LLM Prompt & Evaluation

The local LLM provider includes advanced prompt engineering and evaluation capabilities:

### Testing & Evaluation

- **Manual Testing**: `npm run llm:test` - Test LLM on sample emails with performance metrics
- **Offline Evaluation**: `npm run llm:evaluate` - Run systematic evaluation against anonymized fixtures

### Configuration Tuning

- `ONLYJOBS_CTX=1024` - Context window size (tokens)
- `ONLYJOBS_MAX_TOKENS=128` - Max output tokens per inference
- `ONLYJOBS_N_GPU_LAYERS=0` - GPU acceleration layers (Metal/CUDA)
- `ONLYJOBS_INFER_TIMEOUT_MS=8000` - Timeout before fallback
- `ONLYJOBS_ENABLE_PREFILTER=0/1` - Toggle regex-based prefiltering

### Output Normalization

The system automatically normalizes LLM outputs:
- **Status Mapping**: "screening"→"Interview", "application received"→"Applied", "rejected"→"Declined", "verbal offer"→"Offer"
- **Text Cleaning**: Trims whitespace, removes quotes, collapses spaces
- **JSON Contract**: Strict schema validation with automatic field coercion

### Evaluation Metrics

The evaluator computes:
- Job classification accuracy (binary)
- Status classification accuracy (4-class + null)
- Macro-F1 score across status classes
- Latency distribution by decision path
- Decision path breakdown (cache_hit/prefilter_skip/llm_success/timeout_fallback)

## Troubleshooting

### Better-SQLite3 Issues

If you encounter module version mismatch errors:

```bash
# For Electron
npm rebuild better-sqlite3 --runtime=electron --target=37.2.5 --dist-url=https://electronjs.org/headers

# For Node.js (testing)
npm rebuild better-sqlite3
```

### OAuth Redirect Issues

Ensure redirect URIs use `127.0.0.1` (not `localhost`) as per Google's requirements.

### Email Content Display

HTML emails are automatically converted to plain text for better readability.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- ML classifier model provided by contributor
- Built with Electron and React
- Gmail API integration powered by Google APIs

