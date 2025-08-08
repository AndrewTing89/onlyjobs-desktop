/*
 Export labeling template from job emails for evaluation.
 Usage:
   npm run llm:labels -- --limit=12 [--db=/path/to/jobs.db]
*/

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { getDbPath } from "../electron/llm/config";

type Label = {
  gmail_message_id: string;
  subject: string;
  status: "Applied" | "Interview" | "Declined" | "Offer" | null;
};

function parseArgs(argv: string[]) {
  const args: { limit?: number; db?: string } = {};
  for (const token of argv.slice(2)) {
    if (token.startsWith("--limit=")) {
      const n = Number(token.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) args.limit = Math.floor(n);
    } else if (token.startsWith("--db=")) {
      args.db = token.slice("--db=".length);
    }
  }
  return args;
}


function main() {
  const { limit = 20, db: dbArg } = parseArgs(process.argv);
  const dbPath = dbArg ? path.resolve(dbArg) : getDbPath();

  console.log(`Exporting labels from: ${dbPath}`);
  console.log(`Limit: ${limit}`);

  const db = new Database(dbPath);
  const labels: Label[] = [];

  try {
    // Query job emails only (privacy-first: non-job emails are never stored)
    const rows = db.prepare(`
      SELECT 
        gmail_message_id,
        subject,
        status
      FROM job_emails
      ORDER BY parsed_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      gmail_message_id: string;
      subject: string;
      status: string | null;
    }>;

    console.log(`Query returned ${rows.length} rows`);
    for (const row of rows) {
      labels.push({
        gmail_message_id: row.gmail_message_id,
        subject: row.subject,
        status: null // null = needs labeling
      });
    }

    // Write to labels.json
    const outputPath = path.resolve(process.cwd(), "labels.json");
    fs.writeFileSync(outputPath, JSON.stringify(labels, null, 2));
    
    console.log(`Wrote ${labels.length} labels to ${outputPath}`);

  } finally {
    db.close();
  }
}

main();