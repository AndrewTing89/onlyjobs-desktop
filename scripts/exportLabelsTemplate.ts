/*
 Export a labels.json template from recent emails in the DB.
 Usage:
   npm run llm:labels -- --limit=10 [--db=/path/to/jobs.db]
*/

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

function parseArgs(argv: string[]) {
  const args: { limit: number; db?: string } = { limit: 20 };
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

function getElectronUserDataDir(): string {
  const productName = "OnlyJobs Desktop"; // matches build.productName
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

function fetchRecent(dbPath: string, limit: number) {
  const db = new Database(dbPath);
  try {
    const stmt = db.prepare(`
      SELECT gmail_message_id, subject
      FROM emails
      WHERE gmail_message_id IS NOT NULL
      ORDER BY COALESCE(classified_at, fetched_at, date, internal_date) DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Array<{ gmail_message_id: string; subject: string | null }>;
  } finally {
    db.close();
  }
}

function main() {
  const { limit, db } = parseArgs(process.argv);
  const dbPath = db ? path.resolve(db) : getDefaultDbPath();

  const rows = fetchRecent(dbPath, limit);
  const out = rows.map((r) => ({
    gmail_message_id: r.gmail_message_id,
    subject: r.subject || "",
    is_job_related: null as null,
    job_type: null as null,
  }));

  const dest = path.resolve(process.cwd(), "labels.json");
  fs.writeFileSync(dest, JSON.stringify(out, null, 2), "utf-8");
  console.log(`Wrote ${out.length} labels to ${dest}`);
}

main();
