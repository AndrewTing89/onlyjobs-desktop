/*
 Run recent Gmail messages through local LLM and optionally store results.
 Usage:
   npm run gmail:llm -- --limit=5 --save
*/

import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
// @ts-ignore - local build lacks type declarations for 'html-to-text'
import { convert } from "html-to-text";
import { parseEmailWithLLM } from "../llm/llmEngine";

// Reuse existing Gmail client (CommonJS module)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GmailAuth = require("../gmail-auth.js");

function parseArgs(argv: string[]) {
  const args = { limit: 20, save: false } as { limit: number; save: boolean };
  for (const token of argv.slice(2)) {
    if (token.startsWith("--limit=")) {
      const n = Number(token.split("=")[1]);
      if (Number.isFinite(n) && n > 0) args.limit = Math.floor(n);
    } else if (token === "--save") {
      args.save = true;
    }
  }
  return args;
}

function decodeBase64Url(data: string): string {
  // Gmail returns URL-safe base64
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

function extractSubject(headers: Array<{ name: string; value: string }>): string {
  return headers.find((h) => h.name === "Subject")?.value || "";
}

function findPart(parts: any[] | undefined, mime: string): any | null {
  if (!parts) return null;
  for (const p of parts) {
    if (p.mimeType === mime && p.body?.data) return p;
    const nested = findPart(p.parts, mime);
    if (nested) return nested;
  }
  return null;
}

function extractPlaintextFromMessage(message: any): string {
  const payload = message?.payload || {};
  // Prefer text/plain
  const textPart = payload?.body?.data
    ? { body: payload.body }
    : findPart(payload.parts, "text/plain");
  if (textPart?.body?.data) {
    return decodeBase64Url(textPart.body.data);
  }
  // Fallback to text/html
  const htmlPart = findPart(payload.parts, "text/html");
  if (htmlPart?.body?.data) {
    const html = decodeBase64Url(htmlPart.body.data);
    return convert(html, { wordwrap: 130, selectors: [{ selector: "a", options: { ignoreHref: true } }, { selector: "img", format: "skip" }] });
  }
  return "";
}

function mapStatusToJobType(status: "applied" | "interview" | "rejected" | "offer" | null): string | null {
  if (status === "applied") return "application_sent";
  if (status === "interview") return "interview";
  if (status === "offer") return "offer";
  if (status === "rejected") return "rejection";
  return null;
}

function getElectronUserDataDir(): string {
  // Derive the Electron userData dir based on platform and productName
  const productName = "OnlyJobs Desktop"; // matches package.json build.productName
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", productName);
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), productName);
  return path.join(home, ".config", productName);
}

function getDbPath(): string {
  const override = process.env.ONLYJOBS_DB_PATH;
  if (override && override.trim().length > 0) return path.resolve(override);
  const dir = getElectronUserDataDir();
  return path.join(dir, "jobs.db");
}

function ensureEmailsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      gmail_message_id TEXT UNIQUE NOT NULL,
      subject TEXT,
      from_address TEXT,
      to_address TEXT,
      date DATE,
      snippet TEXT,
      raw_content TEXT,
      account_email TEXT,
      internal_date TEXT,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_classified BOOLEAN DEFAULT 0,
      is_job_related BOOLEAN,
      job_type TEXT,
      ml_confidence REAL,
      classification_method TEXT,
      classified_at TIMESTAMP,
      company_extracted TEXT,
      position_extracted TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_emails_gmail_id ON emails(gmail_message_id);
    CREATE INDEX IF NOT EXISTS idx_emails_classified ON emails(is_classified);
  `);
}

function upsertEmail(db: Database.Database, email: {
  gmail_message_id: string;
  subject: string;
  raw_content: string;
  is_job_related: boolean;
  job_type: string | null;
  company_extracted: string | null;
  position_extracted: string | null;
}) {
  const exists = db.prepare("SELECT id FROM emails WHERE gmail_message_id = ?").get(email.gmail_message_id) as { id: string } | undefined;
  if (exists) {
    db.prepare(
      `UPDATE emails SET subject = ?, raw_content = ?, is_classified = 1, is_job_related = ?, job_type = ?, company_extracted = ?, position_extracted = ?, classified_at = CURRENT_TIMESTAMP WHERE gmail_message_id = ?`
    ).run(
      email.subject,
      email.raw_content,
      email.is_job_related ? 1 : 0,
      email.job_type,
      email.company_extracted,
      email.position_extracted,
      email.gmail_message_id
    );
    return exists.id;
  }
  const id = `email_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  db.prepare(
    `INSERT INTO emails (id, gmail_message_id, subject, raw_content, is_classified, is_job_related, job_type, company_extracted, position_extracted, classified_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).run(
    id,
    email.gmail_message_id,
    email.subject,
    email.raw_content,
    email.is_job_related ? 1 : 0,
    email.job_type,
    email.company_extracted,
    email.position_extracted
  );
  return id;
}

async function main() {
  const { limit, save } = parseArgs(process.argv);
  const gmail = new GmailAuth();

  const { messages } = await gmail.fetchEmails({ maxResults: limit, query: "in:inbox" });
  if (!messages || messages.length === 0) {
    console.log("[]");
    return;
  }

  let db: Database.Database | null = null;
  if (save) {
    const dbPath = getDbPath();
    await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    ensureEmailsTable(db);
  }

  for (const msg of messages) {
    try {
      const headers = msg.payload?.headers || [];
      const subject = extractSubject(headers);
      const plaintext = extractPlaintextFromMessage(msg);

      const result = await parseEmailWithLLM({ subject, plaintext });
      // Print JSON for each message
      process.stdout.write(JSON.stringify({ id: msg.id, subject, ...result }) + "\n");

      if (save && db) {
        const jobType = mapStatusToJobType(result.status);
        upsertEmail(db, {
          gmail_message_id: msg.id,
          subject,
          raw_content: plaintext,
          is_job_related: result.is_job_related,
          job_type: jobType,
          company_extracted: result.company,
          position_extracted: result.position,
        });
      }
    } catch (e) {
      console.error(`Error processing message ${msg?.id}:`, e);
    }
  }

  if (db) db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
