# OnlyJobs Desktop - Project Status & Collaboration Guide

Hey! Here's the current state of the OnlyJobs desktop app and what needs to be done next.

## 🎯 Project Overview

We pivoted from a web app to a desktop application that helps track job applications by:
1. Syncing with Gmail to fetch emails
2. Using ML to classify job-related emails
3. Extracting company/position information
4. Providing a dashboard to track applications

## ✅ What's Been Completed

### Core Infrastructure
- **Electron Desktop App**: Fully functional Electron wrapper with React frontend
- **Gmail OAuth Integration**: Working OAuth flow using AppAuth-JS (desktop-friendly)
  - Multi-account support implemented
  - Secure token storage using electron-store
  - Proper redirect URI handling (127.0.0.1 instead of localhost)
- **Local Database**: SQLite setup for all data storage
- **Two-Stage Email Processing**:
  1. Fetch all emails from Gmail
  2. Classify them using ML model

### UI/UX
- **Dashboard**: Shows all job applications with filtering
- **Email Viewer**: Modal to view full email content
- **Multi-Account Management**: Add/remove multiple Gmail accounts
- **Real-time Updates**: Live sync status and progress indicators

### Technical Fixes
- HTML email parsing (converts to readable text)
- Proper date extraction from email headers
- Better error handling and recovery

## 🚨 Current Issues - ML Classification Performance

**The ML classification accuracy is currently poor.** Here's what's happening:

### Problems:
1. **Low Accuracy**: Many non-job emails are being classified as job-related
2. **Poor Extraction**: Company names often show as "Unknown Company"
3. **Position Detection**: Job titles aren't being extracted reliably
4. **False Positives**: Marketing emails, newsletters, and other automated emails are being flagged

### Current Implementation:
- Using the ML model from your submodule at `ml-classifier/`
- Python script: `classify_email_simple.py`
- Model file: `ml-classifier/data/models/best_model.pkl`

### Examples of Misclassification:
- Promotional emails from companies → Classified as job applications
- LinkedIn notifications → Marked as job-related
- Generic company updates → Flagged as applications

## 🔧 Next Steps - Priority Tasks

### 1. **Improve ML Classification** (Highest Priority)
Since you built the ML model, this would be the perfect area for you to focus on:

- **Retrain the model** with more diverse training data
- **Add confidence thresholds** - only classify emails above certain confidence
- **Improve feature extraction**:
  - Better regex patterns for company names
  - Keywords specific to job applications
  - Sender domain analysis
- **Consider different model approaches**:
  - Try transformer-based models for better context understanding
  - Implement ensemble methods
  - Add rule-based filters as a first pass

### 2. **Performance Optimization**
- Batch processing for email classification
- Implement caching for repeated classifications
- Add progress saving for interrupted syncs

### 3. **Enhanced Features**
- Manual classification override
- Training mode where users can correct classifications
- Export functionality for job application data
- Resume/cover letter attachment detection

## 📁 Key Files for ML Work

```
ml-classifier/
├── scripts/
│   ├── classify_email_simple.py    # Current classifier (needs improvement)
│   └── classify_email.py           # Full classifier (not currently used)
├── data/models/
│   └── best_model.pkl             # Current model (needs retraining)
└── requirements.txt               # Python dependencies

electron/
├── ipc-handlers.js               # Where ML is called (lines 8-80)
└── ml-handler.js                 # ML integration wrapper
```

## 🚀 Getting Started

1. Clone the repo:
   ```bash
   gh repo clone AndrewTing89/onlyjobs-desktop
   ```

2. Run setup:
   ```bash
   ./setup.sh
   ```

3. Test current ML performance:
   ```bash
   cd ml-classifier
   python scripts/classify_email_simple.py --text "Your email text here"
   ```

## 💡 Suggestions for ML Improvements

1. **Quick Wins**:
   - Add company email domain whitelist/blacklist
   - Implement keyword scoring (e.g., "application", "interview", "offer")
   - Use email metadata (sender, subject patterns)

2. **Medium-term**:
   - Collect user feedback for active learning
   - Build separate models for different job platforms
   - Implement confidence-based filtering

3. **Long-term**:
   - Fine-tune a language model specifically for job emails
   - Build extraction models for specific fields
   - Create a feedback loop for continuous improvement

## 📊 Current Stats

From testing with my Gmail:
- ~30% false positive rate
- ~20% missed job emails
- ~50% accuracy on company name extraction
- ~40% accuracy on position extraction

## 🤝 How to Collaborate

1. **ML Improvements**: Focus on the classifier first
2. **Test with Real Data**: The app stores emails in SQLite, you can query them
3. **Iterate Quickly**: The app hot-reloads, so you can test changes immediately
4. **Add Metrics**: Consider adding accuracy tracking to measure improvements

## Questions?

The codebase is well-documented, but here are key things to know:
- Gmail sync works perfectly - the issue is purely classification
- All emails are stored locally, so you can retrain without re-fetching
- The Python ML process is spawned from Node.js (check `electron/ipc-handlers.js`)

Let me know if you need any clarification or have ideas for the ML improvements!

---

**Priority: Get the ML classification accuracy above 80% for job-related emails**