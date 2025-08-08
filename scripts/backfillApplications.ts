/*
 Backfill applications for existing job_emails.
 Links all existing job emails to applications based on the new linking logic.
 
 Usage: tsx scripts/backfillApplications.ts [--db=/path/to/jobs.db]
*/

import path from "path";
import Database from "better-sqlite3";
import { getDbPath } from "../electron/llm/config";
import { ApplicationLinker } from "../electron/llm/linker/service";

function parseArgs(argv: string[]) {
  const args: { db?: string } = {};
  for (const token of argv.slice(2)) {
    if (token.startsWith("--db=")) args.db = token.slice("--db=".length);
  }
  return args;
}

type JobEmailRow = {
  gmail_message_id: string;
  subject: string;
  company: string | null;
  position: string | null;
  status: string | null;
  message_date: number;
  thread_id: string | null;
  from_email: string;
  parsed_at: number;
};

type EmailBodyRow = {
  gmail_message_id: string;
  body_plain: string;
  body_html: string | null;
};

async function main() {
  const { db: dbArg } = parseArgs(process.argv);
  const dbPath = dbArg ? path.resolve(dbArg) : getDbPath();

  console.log(`🔄 Backfilling applications from: ${dbPath}`);

  const db = new Database(dbPath);
  const linker = new ApplicationLinker(db);

  try {
    // Get all existing job emails
    const jobEmails = db.prepare(`
      SELECT 
        gmail_message_id, subject, company, position, status, 
        message_date, thread_id, from_email, parsed_at
      FROM job_emails
      ORDER BY message_date ASC
    `).all() as JobEmailRow[];

    // Get all email bodies
    const emailBodies = db.prepare(`
      SELECT gmail_message_id, body_plain, body_html
      FROM job_email_bodies
    `).all() as EmailBodyRow[];

    const bodyMap = new Map(emailBodies.map(b => [b.gmail_message_id, b]));

    console.log(`📧 Found ${jobEmails.length} job emails to process`);

    // Clear existing application data to start fresh
    console.log(`🗑️  Clearing existing application data...`);
    db.exec(`
      DELETE FROM application_events;
      DELETE FROM email_to_application;  
      DELETE FROM applications;
    `);

    let processedCount = 0;
    let linkingResults = new Map<string, number>(); // track results by company

    for (const email of jobEmails) {
      try {
        const body = bodyMap.get(email.gmail_message_id);
        const bodyText = body?.body_plain || '';

        // Create minimal headers array for feature extraction
        const headers = [
          { name: 'From', value: email.from_email },
          { name: 'Subject', value: email.subject }
        ];

        // Link this email to an application
        const applicationId = linker.linkEmail(
          email.gmail_message_id,
          email.company,
          email.position,
          email.status,
          email.subject,
          bodyText,
          email.from_email,
          headers,
          email.thread_id,
          email.message_date
        );

        // Track results by company
        const company = email.company || 'Unknown';
        linkingResults.set(company, (linkingResults.get(company) || 0) + 1);

        processedCount++;

        if (processedCount % 10 === 0) {
          process.stdout.write(`Processed ${processedCount}/${jobEmails.length} emails...\r`);
        }

      } catch (error) {
        console.error(`\nError processing email ${email.gmail_message_id}:`, error);
      }
    }

    console.log(`\n✅ Backfill complete: ${processedCount}/${jobEmails.length} emails processed`);

    // Show results summary
    console.log(`\n📊 Results by company:`);
    for (const [company, count] of Array.from(linkingResults.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${company}: ${count} emails`);
    }

    // Show application summary
    const appStats = db.prepare(`
      SELECT 
        COUNT(*) as total_applications,
        COUNT(CASE WHEN position IS NOT NULL THEN 1 END) as with_position,
        COUNT(CASE WHEN position IS NULL THEN 1 END) as without_position,
        COUNT(CASE WHEN ats_job_id IS NOT NULL THEN 1 END) as with_ats_id,
        COUNT(CASE WHEN req_id IS NOT NULL THEN 1 END) as with_req_id
      FROM applications
    `).get() as any;

    console.log(`\n🎯 Application Statistics:`);
    console.log(`  Total applications: ${appStats.total_applications}`);
    console.log(`  With position: ${appStats.with_position}`);
    console.log(`  Without position: ${appStats.without_position}`);
    console.log(`  With ATS job ID: ${appStats.with_ats_id}`);
    console.log(`  With requisition ID: ${appStats.with_req_id}`);

    // Show multi-email applications
    const multiEmailApps = db.prepare(`
      SELECT 
        a.company,
        a.position,
        a.current_status,
        COUNT(eta.gmail_message_id) as email_count,
        MIN(ae.event_date) as first_activity,
        MAX(ae.event_date) as last_activity
      FROM applications a
      JOIN email_to_application eta ON a.application_id = eta.application_id
      JOIN application_events ae ON a.application_id = ae.application_id
      GROUP BY a.application_id
      HAVING email_count > 1
      ORDER BY email_count DESC, a.company ASC
    `).all() as any[];

    if (multiEmailApps.length > 0) {
      console.log(`\n🔗 Applications with multiple emails (${multiEmailApps.length} total):`);
      multiEmailApps.slice(0, 10).forEach(app => {
        const pos = app.position || 'Unknown Position';
        const days = Math.ceil((app.last_activity - app.first_activity) / (1000 * 60 * 60 * 24));
        console.log(`  ${app.company} - ${pos}: ${app.email_count} emails over ${days} days`);
      });
      
      if (multiEmailApps.length > 10) {
        console.log(`  ... and ${multiEmailApps.length - 10} more`);
      }
    }

  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});