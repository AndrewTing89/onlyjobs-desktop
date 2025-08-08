# OnlyJobs Desktop

An AI-powered job application tracking desktop app that automatically syncs with Gmail, classifies job-related emails using local LLM, and provides real-time analytics.

[![Electron](https://img.shields.io/badge/Electron-37-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![LLM Powered](https://img.shields.io/badge/LLM-node--llama--cpp-00D4AA?logo=openai)](https://github.com/withcatai/node-llama-cpp)

## Features

- 🔐 **Gmail Integration**: Secure OAuth 2.0 authentication with Gmail
- 🤖 **LLM Classification**: Uses local language models to identify and classify job-related emails
- 📊 **Real-time Dashboard**: Track your job applications with live updates
- 🔄 **Multi-Account Support**: Connect multiple Gmail accounts
- 💾 **Local Storage**: All data stored locally using SQLite
- 🎯 **Smart Extraction**: Extracts company names, positions, and application dates

## Prerequisites

- Node.js (v18 or higher)
- Gmail account
- Google Cloud Platform project with Gmail API enabled

## Installation

1. Clone the repository:
```bash
git clone https://github.com/AndrewTing89/onlyjobs-desktop.git
cd onlyjobs-desktop
```

2. Run the automated setup script:
```bash
bash setup.sh
```

This will:
- Install all npm dependencies (including better-sqlite3 rebuild)  
- Check for LLM model and provide download instructions if needed
- Create `.env` file template

3. Download LLM model (if not present):
```bash
npm run llm:download
```

4. Add Gmail API credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a project and enable Gmail API
   - Download `gmail_credentials.json` and place in project root
   - Update `.env` file with your OAuth client ID and secret

## Running the App

### Quick Start (Recommended)

Start the complete application with one command:

```bash
npm run dev
```

This starts both React dev server and Electron automatically.

### Manual Development Mode

If you prefer separate terminals:

```bash
# Terminal 1 - Start React dev server
npm start

# Terminal 2 - Start Electron (after React server is running)
npm run electron-dev
```

### Production Build

```bash
# Build and package Electron app
npm run dist
```

## Testing

Run the Jest test suite:

```bash
npm test
```

## Local LLM Setup

- Model: place a 3B Q4 GGUF model at `./models/model.gguf` (e.g., `Llama-3.2-3B-Instruct-Q4_K_M.gguf`).
- Environment variables (optional):
  - `ONLYJOBS_MODEL_PATH` (default `./models/model.gguf`)
  - `ONLYJOBS_TEMPERATURE` (default `0.2`)
  - `ONLYJOBS_MAX_TOKENS` (default `256`)
  - `ONLYJOBS_CTX` (default `2048`)
  - `ONLYJOBS_N_GPU_LAYERS` (default `0`)
- Install deps: `npm run llm:deps`
- Download model automatically:
  - `npm run llm:download`
  - Saves to `./models/model.gguf`. Skip occurs if file exists and size matches the remote.
- Run manual test after download: `npm run llm:test` (prints strict JSON)

### Run the Gmail → LLM script

- Fetch and parse your most recent emails locally using the LLM:
  - `npm run gmail:llm` (defaults to `--limit=20`)
  - `npm run gmail:llm -- --limit=5 --save` to write results into the local SQLite DB
- Storage mapping when `--save` is used:
  - `emails.gmail_message_id` = Gmail message ID
  - `emails.subject`, `emails.raw_content`
  - Extracted `company_extracted`, `position_extracted`, `is_job_related`, `job_type`

### Evaluate LLM accuracy with labels

1) Create a `labels.json` with ground truth entries (example):

```json
[
  { "gmail_message_id": "17c123abc...", "is_job_related": true,  "job_type": "interview" },
  { "gmail_message_id": "17c456def...", "is_job_related": false, "job_type": null }
]
```

2) Run evaluation (DB path auto-detected; override with `ONLYJOBS_DB_PATH` or `--db`):

```bash
npm run llm:evaluate -- --label-file=./labels.json
# or specify DB
npm run llm:evaluate -- --label-file=./labels.json --db=/path/to/jobs.db
```

The script prints total evaluated, `is_job_related` accuracy, `job_type` accuracy (only for ground-truth job-related), a confusion matrix, and up to 5 example mismatches for each category.

#### Generate a labels.json template

Export a starter `labels.json` from recent emails, then fill in ground truth:

```bash
npm run llm:labels -- --limit=10
# Opens/edits ./labels.json and update is_job_related (true/false) and job_type ("applied"|"interview"|"rejected"|"offer"|null)
```

## Project Structure

```
onlyjobs-desktop/
├── electron/              # Electron main process files
│   ├── main.js           # Main entry point
│   ├── ipc-handlers.js   # IPC communication handlers  
│   ├── gmail-auth.js     # Gmail authentication
│   ├── llm/              # Local LLM engine
│   │   ├── llmEngine.ts  # LLM inference engine
│   │   ├── config.ts     # Model configuration
│   │   └── linker/       # Application linking system
│   └── ipc/              # IPC handlers
│       ├── emailFetch.js # Email processing pipeline
│       └── gmailAuth.js  # Gmail OAuth flow
├── src/                  # React app source
│   ├── components/       # React components
│   │   ├── GmailConnect.tsx # Gmail OAuth UI
│   │   └── JobsList.tsx  # Job applications list
│   ├── pages/           # Page components
│   └── ElectronApp.tsx  # Main Electron app component
├── models/              # Local LLM models
│   └── model.gguf      # GGUF model file
└── public/             # Static assets
```

## Key Technologies

- **Frontend**: React 19, TypeScript, Material-UI
- **Desktop**: Electron 37
- **Database**: SQLite3 (better-sqlite3)
- **LLM**: node-llama-cpp with GGUF models
- **Authentication**: Google OAuth 2.0 (AppAuth-JS)

## Development Notes

### Gmail Sync Process

1. **OAuth Authentication**: Connect Gmail account through secure OAuth flow
2. **Email Fetching**: Download recent emails from Gmail via API
3. **LLM Classification**: Process emails through local language model
4. **Data Extraction**: Extract company, position, status information
5. **Local Storage**: Save job-related emails to local SQLite database

### Database Schema

The app uses SQLite with the following main tables:
- `emails`: Stores all fetched emails
- `jobs`: Stores classified job applications
- `gmail_accounts`: Manages multiple Gmail accounts
- `sync_status`: Tracks sync progress

### LLM Classification

The local LLM engine identifies job-related emails and extracts structured data:
- **Context Understanding**: Analyzes full email content and context
- **Structured Output**: Returns JSON with company, position, status
- **High Accuracy**: Better than traditional keyword-based approaches
- **Privacy First**: All processing happens locally, no data sent to external APIs
- **Fast Inference**: Optimized GGUF models for quick classification

### User Interface Workflow

1. **Launch App**: `npm run dev` → Electron window opens
2. **Connect Gmail**: Click "Connect Gmail" → OAuth browser flow → Shows "Connected: email@domain.com"
3. **Fetch Emails**: Click "Fetch Latest 50 Emails" → LLM processes emails → Jobs list updates automatically
4. **View Results**: Browse job applications in the dashboard
5. **Email Details**: Click on any job to view full email content and application timeline

All processing happens through the UI - no terminal commands needed for normal use!

## Troubleshooting

### Better-SQLite3 Issues

If you encounter module version mismatch errors:

```bash
# The postinstall script should handle this automatically, but you can run manually:
npm rebuild better-sqlite3 --build-from-source

# Or use the electron rebuilder:
./node_modules/.bin/electron-rebuild
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

- Local LLM processing powered by node-llama-cpp
- Built with Electron and React  
- Gmail API integration powered by Google APIs
- GGUF model format support from llama.cpp community

