/*
 Database inspector script for OnlyJobs.
 Shows counts and sample data from the new schema tables.
 
 Usage: tsx scripts/dbInspect.ts [--db=/path/to/jobs.db]
*/

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

function formatDate(timestamp: number | null): string {
  if (!timestamp) return "null";
  return new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19);
}

function main() {
  const { db: dbArg } = parseArgs(process.argv);
  const dbPath = dbArg ? path.resolve(dbArg) : getDbPath();

  console.log(`📊 Database Inspector`);
  console.log(`Database: ${dbPath}`);
  console.log("=" .repeat(80));

  const db = new Database(dbPath);
  try {
    // Check if tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    console.log(`\n📋 Tables: ${tables.map(t => t.name).join(', ')}`);

    // Privacy-first design: only job emails are stored
    console.log(`\n🔒 Privacy Note: Only job-related emails are stored (non-job emails never saved)`);

    // Job emails counts
    try {
      const jobEmailsCount = db.prepare("SELECT COUNT(*) as count FROM job_emails").get() as { count: number };
      console.log(`\n💼 Job Emails: ${jobEmailsCount.count} total (metadata)`);

      // Job email bodies count
      const jobBodiesCount = db.prepare("SELECT COUNT(*) as count FROM job_email_bodies").get() as { count: number };
      console.log(`📄 Job Email Bodies: ${jobBodiesCount.count} total (content)`);

      // Status breakdown
      const statusBreakdown = db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM job_emails 
        WHERE status IS NOT NULL 
        GROUP BY status 
        ORDER BY count DESC
      `).all() as { status: string; count: number }[];
      
      if (statusBreakdown.length > 0) {
        console.log(`   Status breakdown:`);
        for (const { status, count } of statusBreakdown) {
          console.log(`   - ${status}: ${count}`);
        }
      }
      
      const nullStatusCount = db.prepare("SELECT COUNT(*) as count FROM job_emails WHERE status IS NULL").get() as { count: number };
      if (nullStatusCount.count > 0) {
        console.log(`   - null status: ${nullStatusCount.count}`);
      }
    } catch (err) {
      console.log(`\n💼 Job Emails: Table not found or empty`);
    }


    // Latest job emails
    try {
      const latestJobs = db.prepare(`
        SELECT gmail_message_id, company, position, status, message_date, subject, parsed_at
        FROM job_emails 
        ORDER BY parsed_at DESC 
        LIMIT 5
      `).all() as Array<{
        gmail_message_id: string;
        company: string | null;
        position: string | null;
        status: string | null;
        message_date: number;
        subject: string;
        parsed_at: number;
      }>;

      if (latestJobs.length > 0) {
        console.log(`\n🏢 Latest 5 Job Emails:`);
        console.log(`${'Company'.padEnd(20)} ${'Position'.padEnd(25)} ${'Status'.padEnd(12)} ${'Subject'.padEnd(30)}`);
        console.log("-".repeat(90));
        for (const row of latestJobs) {
          const company = (row.company || 'null').substring(0, 18) + (row.company && row.company.length > 18 ? '..' : '');
          const position = (row.position || 'null').substring(0, 23) + (row.position && row.position.length > 23 ? '..' : '');
          const status = row.status || 'null';
          const subject = (row.subject || '').substring(0, 28) + (row.subject && row.subject.length > 28 ? '..' : '');
          console.log(`${company.padEnd(20)} ${position.padEnd(25)} ${status.padEnd(12)} ${subject}`);
        }
      }
    } catch (err) {
      console.log(`\n🏢 Latest Job Emails: Error reading data`);
    }

    // Sample job email bodies
    try {
      const sampleBodies = db.prepare(`
        SELECT j.gmail_message_id, j.subject, j.company, b.body_excerpt
        FROM job_emails j
        JOIN job_email_bodies b ON j.gmail_message_id = b.gmail_message_id
        ORDER BY j.parsed_at DESC 
        LIMIT 3
      `).all() as Array<{
        gmail_message_id: string;
        subject: string;
        company: string | null;
        body_excerpt: string;
      }>;

      if (sampleBodies.length > 0) {
        console.log(`\n📝 Sample Job Email Bodies (excerpts):`);
        console.log("-".repeat(80));
        for (const row of sampleBodies) {
          const company = row.company || 'Unknown';
          console.log(`${company} - ${row.subject}`);
          console.log(`${row.body_excerpt.substring(0, 200)}${row.body_excerpt.length > 200 ? '...' : ''}`);
          console.log("");
        }
      }
    } catch (err) {
      console.log(`\n📝 Sample Bodies: Error reading data`);
    }

    // Applications
    try {
      const appCount = db.prepare("SELECT COUNT(*) as count FROM applications").get() as { count: number };
      console.log(`\n🎯 Applications: ${appCount.count} total`);

      if (appCount.count > 0) {
        // Application status breakdown
        const statusBreakdown = db.prepare(`
          SELECT current_status, COUNT(*) as count 
          FROM applications 
          GROUP BY current_status 
          ORDER BY count DESC
        `).all() as { current_status: string | null; count: number }[];
        
        if (statusBreakdown.length > 0) {
          console.log(`   Status breakdown:`);
          for (const { current_status, count } of statusBreakdown) {
            console.log(`   - ${current_status || 'null'}: ${count}`);
          }
        }

        // Multi-email applications
        const multiEmailApps = db.prepare(`
          SELECT 
            a.company,
            a.position,
            a.current_status,
            COUNT(eta.gmail_message_id) as email_count
          FROM applications a
          JOIN email_to_application eta ON a.application_id = eta.application_id
          GROUP BY a.application_id
          HAVING email_count > 1
          ORDER BY email_count DESC
          LIMIT 5
        `).all() as any[];

        if (multiEmailApps.length > 0) {
          console.log(`\n🔗 Applications with Multiple Emails:`);
          console.log(`${'Company'.padEnd(25)} ${'Position'.padEnd(30)} ${'Status'.padEnd(12)} ${'Emails'}`);
          console.log("-".repeat(80));
          for (const row of multiEmailApps) {
            const company = (row.company || 'Unknown').substring(0, 23) + (row.company && row.company.length > 23 ? '..' : '');
            const position = (row.position || 'Unknown Position').substring(0, 28) + (row.position && row.position.length > 28 ? '..' : '');
            const status = row.current_status || 'null';
            console.log(`${company.padEnd(25)} ${position.padEnd(30)} ${status.padEnd(12)} ${row.email_count}`);
          }
        }

        // Application timeline sample
        const timelineApps = db.prepare(`
          SELECT 
            a.application_id,
            a.company,
            a.position,
            COUNT(ae.event_id) as event_count,
            MIN(ae.event_date) as first_event,
            MAX(ae.event_date) as last_event
          FROM applications a
          JOIN application_events ae ON a.application_id = ae.application_id
          GROUP BY a.application_id
          ORDER BY event_count DESC, a.last_updated_at DESC
          LIMIT 3
        `).all() as any[];

        if (timelineApps.length > 0) {
          console.log(`\n📅 Sample Application Timelines:`);
          for (const app of timelineApps) {
            const company = app.company || 'Unknown';
            const position = app.position || 'Unknown Position';
            const days = Math.ceil((app.last_event - app.first_event) / (1000 * 60 * 60 * 24));
            console.log(`\n${company} - ${position} (${app.event_count} events over ${days} days):`);
            
            const events = db.prepare(`
              SELECT event_type, status, subject, event_date
              FROM application_events 
              WHERE application_id = ?
              ORDER BY event_date ASC
              LIMIT 5
            `).all(app.application_id) as any[];
            
            events.forEach((event: any) => {
              const date = new Date(event.event_date).toISOString().substring(0, 10);
              const status = event.status || event.event_type;
              const subject = event.subject.length > 40 ? event.subject.substring(0, 37) + '...' : event.subject;
              console.log(`  ${date} ${status.padEnd(12)} ${subject}`);
            });
          }
        }
      }
    } catch (err) {
      console.log(`\n🎯 Applications: Table not found or empty`);
    }

    // Legacy emails table (if exists)
    try {
      const legacyCount = db.prepare("SELECT COUNT(*) as count FROM emails").get() as { count: number };
      console.log(`\n📦 Legacy emails table: ${legacyCount.count} rows (deprecated)`);
    } catch (err) {
      // Table doesn't exist, which is fine
    }

  } finally {
    db.close();
  }
  
  console.log("\n" + "=".repeat(80));
}

main();