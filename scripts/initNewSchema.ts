/*
 Initialize the new database schema for OnlyJobs.
 Safe to run multiple times (idempotent).
 
 Usage: tsx scripts/initNewSchema.ts [--db=/path/to/jobs.db]
*/

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { getDbPath } from "../electron/llm/config";

function parseArgs(argv: string[]) {
  const args: { db?: string } = {};
  for (const token of argv.slice(2)) {
    if (token.startsWith("--db=")) args.db = token.slice("--db=".length);
  }
  return args;
}

export function initNewSchema(db: Database.Database) {
  // Create job-only schema tables
  db.exec(`
    -- 1) Structured job email metadata
    CREATE TABLE IF NOT EXISTS job_emails (
      gmail_message_id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      company TEXT,
      position TEXT,
      status TEXT CHECK (status IN ('Applied','Interview','Declined','Offer')),
      message_date INTEGER,
      thread_id TEXT,
      from_email TEXT,
      parsed_at INTEGER NOT NULL,
      model_name TEXT,
      prompt_version TEXT,
      rule_hint_used INTEGER,
      confidence REAL
    );

    -- 2) Raw bodies for job emails
    CREATE TABLE IF NOT EXISTS job_email_bodies (
      gmail_message_id TEXT PRIMARY KEY REFERENCES job_emails(gmail_message_id) ON DELETE CASCADE,
      body_plain TEXT NOT NULL,
      body_html TEXT,
      body_excerpt TEXT,
      stored_at INTEGER NOT NULL
    );

    -- 3) Applications for tracking job application journeys
    CREATE TABLE IF NOT EXISTS applications (
      application_id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      position TEXT,
      role_key TEXT,
      ats_portal TEXT CHECK (ats_portal IN ('greenhouse','lever','workday','smartrecruiters','icims','bamboohr')),
      ats_job_id TEXT,
      req_id TEXT,
      position_fingerprint TEXT,
      content_fingerprint TEXT,
      location TEXT,
      team TEXT,
      current_status TEXT CHECK (current_status IN ('Applied','Interview','Declined','Offer')),
      created_at INTEGER NOT NULL,
      last_updated_at INTEGER NOT NULL
    );

    -- 4) Link emails to applications
    CREATE TABLE IF NOT EXISTS email_to_application (
      gmail_message_id TEXT NOT NULL REFERENCES job_emails(gmail_message_id) ON DELETE CASCADE,
      application_id TEXT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
      confidence REAL NOT NULL,
      linkage_reason TEXT NOT NULL CHECK (linkage_reason IN ('auto_link','needs_review','auto_merge')),
      linked_at INTEGER NOT NULL,
      PRIMARY KEY (gmail_message_id, application_id)
    );

    -- 5) Application events timeline
    CREATE TABLE IF NOT EXISTS application_events (
      event_id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
      gmail_message_id TEXT NOT NULL REFERENCES job_emails(gmail_message_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      status TEXT CHECK (status IN ('Applied','Interview','Declined','Offer')),
      event_date INTEGER NOT NULL,
      subject TEXT NOT NULL,
      linkage_reason TEXT
    );

    -- indexes
    CREATE INDEX IF NOT EXISTS idx_job_emails_status ON job_emails(status);
    CREATE INDEX IF NOT EXISTS idx_job_emails_message_date ON job_emails(message_date DESC);
    CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company);
    CREATE INDEX IF NOT EXISTS idx_applications_role_key ON applications(role_key);
    CREATE INDEX IF NOT EXISTS idx_applications_last_updated ON applications(last_updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_to_application_app_id ON email_to_application(application_id);
    CREATE INDEX IF NOT EXISTS idx_application_events_app_id ON application_events(application_id);
    CREATE INDEX IF NOT EXISTS idx_application_events_date ON application_events(event_date DESC);
    
    -- Unique constraint on company + role_key (partial index)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_company_role_key 
    ON applications(company, role_key) WHERE role_key IS NOT NULL;
  `);
  
  console.log("✅ Job-only schema initialized successfully");
}

async function main() {
  const { db: dbArg } = parseArgs(process.argv);
  const dbPath = dbArg ? path.resolve(dbArg) : getDbPath();

  console.log(`Initializing new schema in: ${dbPath}`);
  
  // Ensure directory exists
  await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
  
  const db = new Database(dbPath);
  try {
    initNewSchema(db);
    console.log("Schema initialization complete.");
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Schema initialization failed:", err);
    process.exit(1);
  });
}