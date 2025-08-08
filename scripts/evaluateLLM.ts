/*
 Evaluate LLM Gmail parsing accuracy against ground-truth labels.
 Usage:
   npm run llm:evaluate -- --label-file=./labels.json [--db=/path/to/jobs.db]
*/

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

type Label = {
  gmail_message_id: string;
  is_job_related: boolean;
  job_type: "application_sent" | "interview" | "rejection" | "offer" | null;
};

type Row = {
  gmail_message_id: string;
  subject: string | null;
  is_job_related: number | boolean | null;
  job_type: string | null;
};

function parseArgs(argv: string[]) {
  const args: { db?: string; labelFile?: string } = {};
  for (const token of argv.slice(2)) {
    if (token.startsWith("--db=")) args.db = token.slice("--db=".length);
    else if (token.startsWith("--label-file=")) args.labelFile = token.slice("--label-file=".length);
  }
  return args;
}

function getElectronUserDataDir(): string {
  const productName = "OnlyJobs Desktop";
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", productName);
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), productName);
  return path.join(home, ".config", productName);
}

function getDefaultDbPath(): string {
  const override = process.env.ONLYJOBS_DB_PATH;
  if (override && override.trim().length > 0) return path.resolve(override);
  return path.join(getElectronUserDataDir(), "jobs.db");
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
      const stmt = db.prepare(`SELECT gmail_message_id, subject, is_job_related, job_type FROM emails WHERE gmail_message_id IN (${placeholders})`);
      chunks.push(...(stmt.all(...batch) as Row[]));
    }
    return chunks;
  } finally {
    db.close();
  }
}

function toBool(v: number | boolean | null | undefined): boolean | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  return v === 1;
}

function main() {
  const { db, labelFile } = parseArgs(process.argv);
  if (!labelFile) {
    console.error("--label-file is required");
    process.exit(1);
  }
  const dbPath = db ? path.resolve(db) : getDefaultDbPath();

  const labels = readLabels(labelFile);
  const idToLabel = new Map(labels.map((l) => [l.gmail_message_id, l] as const));

  const rows = fetchRows(dbPath, labels.map((l) => l.gmail_message_id));
  const idToRow = new Map(rows.map((r) => [r.gmail_message_id, r] as const));

  let clsTotal = 0;
  let clsCorrect = 0;
  let tp = 0, tn = 0, fp = 0, fn = 0;
  const clsMismatches: any[] = [];

  let statusTotal = 0;
  let statusCorrect = 0;
  const statusMismatches: any[] = [];

  for (const label of labels) {
    const row = idToRow.get(label.gmail_message_id);
    if (!row) continue; // skip missing rows

    // Classification accuracy
    const predJob = toBool(row.is_job_related);
    if (predJob != null) {
      clsTotal++;
      if (predJob === label.is_job_related) {
        clsCorrect++;
        if (label.is_job_related) tp++; else tn++;
      } else {
        if (label.is_job_related) fn++; else fp++;
        if (clsMismatches.length < 5) {
          clsMismatches.push({
            gmail_message_id: label.gmail_message_id,
            subject: row.subject,
            pred_is_job_related: predJob,
            true_is_job_related: label.is_job_related,
          });
        }
      }
    }

    // Status accuracy only if ground truth is job-related
    if (label.is_job_related) {
      statusTotal++;
      const predType = row.job_type ?? null;
      if (predType === label.job_type) {
        statusCorrect++;
      } else if (statusMismatches.length < 5) {
        statusMismatches.push({
          gmail_message_id: label.gmail_message_id,
          subject: row.subject,
          pred_job_type: predType,
          true_job_type: label.job_type,
        });
      }
    }
  }

  const clsAcc = clsTotal > 0 ? (clsCorrect / clsTotal) * 100 : 0;
  const stAcc = statusTotal > 0 ? (statusCorrect / statusTotal) * 100 : 0;

  // Output
  console.log("LLM Evaluation Results\n=====================");
  console.log(`DB: ${dbPath}`);
  console.log(`Labels: ${path.resolve(labelFile!)}`);
  console.log("");
  console.log(`Total evaluated: ${clsTotal}`);
  console.log(`is_job_related accuracy: ${clsAcc.toFixed(1)}% (${clsCorrect}/${clsTotal})`);
  console.log(`job_type accuracy (on job-related): ${stAcc.toFixed(1)}% (${statusCorrect}/${statusTotal})`);
  console.log("");
  console.log("Confusion matrix (is_job_related):");
  console.log("  GT\\Pred   true    false");
  console.log(`  true      ${String(tp).padStart(5)}  ${String(fn).padStart(6)}`);
  console.log(`  false     ${String(fp).padStart(5)}  ${String(tn).padStart(6)}`);
  console.log("");
  if (clsMismatches.length > 0) {
    console.log("Example classification mismatches (max 5):");
    for (const m of clsMismatches) {
      console.log(`- ${m.gmail_message_id} | ${m.subject} | pred=${m.pred_is_job_related} vs true=${m.true_is_job_related}`);
    }
    console.log("");
  }
  if (statusMismatches.length > 0) {
    console.log("Example status mismatches (max 5):");
    for (const m of statusMismatches) {
      console.log(`- ${m.gmail_message_id} | ${m.subject} | pred=${m.pred_job_type} vs true=${m.true_job_type}`);
    }
  }
}

main();
