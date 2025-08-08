// Export a labels.json template from recent emails in the DB.
// Usage:
//   npm run llm:labels -- --limit=10 [--db=/path/to/jobs.db]

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function parseArgs(argv) {
  const args = { limit: 20, db: undefined };
  for (const token of argv.slice(2)) {
    if (token.startsWith('--limit=')) {
      const n = Number(token.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) args.limit = Math.floor(n);
    } else if (token.startsWith('--db=')) {
      args.db = token.slice('--db='.length);
    }
  }
  return args;
}

function getElectronUserDataDir() {
  const productName = 'OnlyJobs Desktop';
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', productName);
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), productName);
  return path.join(home, '.config', productName);
}

function getDefaultDbPath() {
  const override = process.env.ONLYJOBS_DB_PATH;
  if (override && override.trim().length > 0) return path.resolve(override);
  return path.join(getElectronUserDataDir(), 'jobs.db');
}

function fetchRecent(dbPath, limit) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    return [];
  }
  const dbExists = fs.existsSync(dbPath);
  const db = new Database(dbPath);
  try {
    const stmt = db.prepare(`
      SELECT gmail_message_id, subject
      FROM emails
      WHERE gmail_message_id IS NOT NULL
      ORDER BY COALESCE(classified_at, fetched_at, date, internal_date) DESC
      LIMIT ?
    `);
    return stmt.all(limit);
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
    subject: r.subject || '',
    is_job_related: null,
    job_type: null,
  }));

  const dest = path.resolve(process.cwd(), 'labels.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Wrote ${out.length} labels to ${dest}`);
}

main();
