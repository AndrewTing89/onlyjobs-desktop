# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OnlyJobs is an AI-powered job application tracking system with a React frontend and Google Cloud Platform backend. It automatically syncs with Gmail, uses AI to classify job applications, and provides real-time analytics.

## Common Development Commands

### Frontend Development
```bash
cd frontend
npm install                 # Install dependencies
npm start                   # Start dev server on http://localhost:3000
npm run build              # Production build
npm test                   # Run tests
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt    # Install Python dependencies

# Run services locally
cd services/process_emails
python main.py

# Run tests
python -m pytest tests/
```

### Deployment
```bash
# Use automated deployment notebook
jupyter notebook deployments.ipynb

# Or manual deployment
gcloud run deploy process-emails --source backend/services/process_emails
firebase deploy    # Deploy frontend
```

## High-Level Architecture

### Frontend Architecture
- **Single Page Application**: React 19 + TypeScript
- **State Management**: React Context API for authentication
- **Routing**: React Router v7 with protected routes
- **UI Components**: Material-UI v7 + Chakra UI hybrid approach
- **Data Fetching**: Custom hooks with Firebase Firestore real-time listeners
- **Authentication**: Firebase Auth with email/password and OAuth

### Backend Architecture
- **Microservices**: Deployed as separate Cloud Run services
- **Event-Driven**: Gmail → Pub/Sub → AI Processing → Storage
- **AI Processing**: Vertex AI (Gemini 2.5 Flash) for email classification
- **Data Storage**: 
  - BigQuery for analytics and historical data
  - Firestore for real-time user data and quick access
- **Data Pipeline**: dbt for transformations in BigQuery

### Key Service Boundaries
1. **Gmail Fetch Service**: OAuth token management, periodic email fetching
2. **Email Processing Service**: AI classification, data extraction, storage
3. **dbt Trigger Function**: Scheduled data transformations
4. **Frontend API**: Direct Firestore access via Firebase SDK

## Important Development Patterns

### Frontend Patterns
- Components in `frontend/src/components/` should be reusable and typed
- Pages in `frontend/src/pages/` handle routing and data fetching
- Services in `frontend/src/services/` wrap Firebase operations
- All TypeScript types defined in `frontend/src/types/`
- Authentication state managed via AuthContext

### Backend Patterns
- Each service has its own directory under `backend/services/`
- Cloud Functions in `backend/functions/` handle specific tasks
- Environment variables managed through Google Cloud Console
- All services containerized with Dockerfile

### Data Schema
- Job application schema defined in `schema.json`
- BigQuery tables follow naming convention: `onlyjobs.core.*`
- Firestore collections: `users/{userId}/jobs`, `users/{userId}/settings`

## Testing Approach
- Frontend: Jest + React Testing Library (run with `npm test`)
- Backend: pytest for unit tests
- Integration tests in `integration_tests.ipynb`
- Manual testing via local development servers

## Security Considerations
- Never commit secrets or API keys
- Use Google Secret Manager for sensitive configuration
- Firebase Security Rules protect user data
- IAM roles follow least-privilege principle

## Common Tasks

### Adding a New Feature
1. Update TypeScript types if needed
2. Create/modify React components
3. Update backend services if data processing changes
4. Test locally before deployment
5. Deploy using the automated notebook

### Debugging Issues
- Frontend logs: Browser DevTools console
- Backend logs: Google Cloud Console → Cloud Run → Logs
- Pub/Sub issues: Check message acknowledgment in GCP Console
- AI processing: Review Vertex AI logs and model responses

### Performance Optimization
- Frontend: Use React.memo for expensive components
- Backend: Monitor Cloud Run metrics, adjust concurrency
- Database: Use Firestore indexes for complex queries
- BigQuery: Partition tables by date for cost efficiency