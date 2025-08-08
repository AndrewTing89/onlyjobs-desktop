/*
 Evaluate LLM Gmail parsing accuracy against ground-truth labels.
 Usage:
   npm run llm:evaluate -- --label-file=./labels.json [--db=/path/to/jobs.db]
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

type Row = {
  gmail_message_id: string;
  subject: string | null;
  status: string | null;
};

function parseArgs(argv: string[]) {
  const args: { db?: string; labelFile?: string } = {};
  for (const token of argv.slice(2)) {
    if (token.startsWith("--db=")) args.db = token.slice("--db=".length);
    else if (token.startsWith("--label-file=")) args.labelFile = token.slice("--label-file=".length);
  }
  return args;
}


function readLabels(p: string): Label[] {
  const raw = fs.readFileSync(p, "utf-8");
  const arr = JSON.parse(raw) as Label[];
  if (!Array.isArray(arr)) throw new Error("label file must be a JSON array");
  return arr;
}

function fetchRows(dbPath: string, ids: string[]): Row[] {
  const db = new Database(dbPath);
  try {
    const chunks: Row[] = [];
    const BATCH = 200;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const placeholders = batch.map(() => "?").join(",");
      const stmt = db.prepare(`
        SELECT 
          gmail_message_id, 
          subject, 
          status
        FROM job_emails
        WHERE gmail_message_id IN (${placeholders})
      `);
      chunks.push(...(stmt.all(...batch) as Row[]));
    }
    return chunks;
  } finally {
    db.close();
  }
}


function main() {
  const { db, labelFile } = parseArgs(process.argv);
  if (!labelFile) {
    console.error("--label-file is required");
    process.exit(1);
  }
  const dbPath = db ? path.resolve(db) : getDbPath();

  const labels = readLabels(labelFile);
  const idToLabel = new Map(labels.map((l) => [l.gmail_message_id, l] as const));

  const rows = fetchRows(dbPath, labels.map((l) => l.gmail_message_id));
  const idToRow = new Map(rows.map((r) => [r.gmail_message_id, r] as const));

  let statusTotal = 0;
  let statusCorrect = 0;
  const statusMismatches: any[] = [];

  for (const label of labels) {
    const row = idToRow.get(label.gmail_message_id);
    if (!row) continue; // skip missing rows

    // Status accuracy evaluation
    statusTotal++;
    if (row.status === label.status) {
      statusCorrect++;
    } else if (statusMismatches.length < 5) {
      statusMismatches.push({
        gmail_message_id: label.gmail_message_id,
        subject: row.subject,
        pred_status: row.status,
        true_status: label.status,
      });
    }
  }

  const statusAcc = statusTotal > 0 ? (statusCorrect / statusTotal) * 100 : 0;

  // Output
  console.log("LLM Status Evaluation Results\n============================");
  console.log(`DB: ${dbPath}`);
  console.log(`Labels: ${path.resolve(labelFile!)}`);
  console.log("");
  console.log(`Total evaluated: ${statusTotal}`);
  console.log(`Status accuracy: ${statusAcc.toFixed(1)}% (${statusCorrect}/${statusTotal})`);
  console.log("");
  console.log("Note: All emails in the database are job-related (privacy-first design)");
  console.log("");
  if (statusMismatches.length > 0) {
    console.log("Example status mismatches (max 5):");
    for (const m of statusMismatches) {
      console.log(`- ${m.gmail_message_id} | ${m.subject} | pred=${m.pred_status} vs true=${m.true_status}`);
    }
  }
}

main();
