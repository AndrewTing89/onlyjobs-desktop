/*
 Run recent Gmail messages through local LLM and store only job-related results.
 Usage:
   npm run gmail:llm -- --limit=5 --save
*/

import path from "path";
import fs from "fs";
import crypto from "crypto";
import Database from "better-sqlite3";
// @ts-ignore - local build lacks type declarations for 'html-to-text'
import { convert } from "html-to-text";
import { parseEmailWithLLM } from "../llm/llmEngine";
import { getDbPath, PROMPT_VERSION, MODEL_NAME } from "../llm/config";
import { initNewSchema } from "../../scripts/initNewSchema";
import { getStatusHint } from "../llm/rules";
import { ApplicationLinker } from "../llm/linker/service";

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

function extractFromEmail(headers: Array<{ name: string; value: string }>): string {
  return headers.find((h) => h.name === "From")?.value || "";
}

function extractDate(headers: Array<{ name: string; value: string }>, internalDate?: string): number {
  // Try Date header first, then internalDate
  const dateHeader = headers.find((h) => h.name === "Date")?.value;
  if (dateHeader) {
    const parsed = new Date(dateHeader).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  
  if (internalDate) {
    const parsed = Number(internalDate);
    if (Number.isFinite(parsed)) return parsed;
  }
  
  return Date.now(); // fallback
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

function extractHtmlFromMessage(message: any): string | null {
  const payload = message?.payload || {};
  const htmlPart = findPart(payload.parts, "text/html");
  if (htmlPart?.body?.data) {
    return decodeBase64Url(htmlPart.body.data);
  }
  return null;
}

function computeBodySha256(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext, "utf-8").digest("hex");
}

function shouldReparse(db: Database.Database, gmailMessageId: string, bodySha256: string): boolean {
  const existing = db.prepare(
    "SELECT gmail_message_id FROM job_email_bodies WHERE gmail_message_id = ? AND body_plain = ?"
  ).get(gmailMessageId, bodySha256) as { gmail_message_id: string } | undefined;
  
  return !existing; // Re-parse if not found or body changed
}

function upsertJobEmail(db: Database.Database, data: {
  gmailMessageId: string;
  subject: string;
  company: string | null;
  position: string | null;
  status: string | null;
  messageDate: number;
  threadId: string | null;
  fromEmail: string;
  ruleHintUsed: boolean;
}) {
  const now = Date.now();
  
  db.prepare(`
    INSERT INTO job_emails (
      gmail_message_id, subject, company, position, status, message_date,
      thread_id, from_email, parsed_at, model_name, prompt_version, rule_hint_used
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(gmail_message_id) DO UPDATE SET
      subject = excluded.subject,
      company = excluded.company,
      position = excluded.position,
      status = excluded.status,
      message_date = excluded.message_date,
      thread_id = excluded.thread_id,
      from_email = excluded.from_email,
      parsed_at = excluded.parsed_at,
      model_name = excluded.model_name,
      prompt_version = excluded.prompt_version,
      rule_hint_used = excluded.rule_hint_used
  `).run(
    data.gmailMessageId,
    data.subject,
    data.company,
    data.position,
    data.status,
    data.messageDate,
    data.threadId,
    data.fromEmail,
    now,
    MODEL_NAME,
    PROMPT_VERSION,
    data.ruleHintUsed ? 1 : 0
  );
}

function upsertJobEmailBody(db: Database.Database, data: {
  gmailMessageId: string;
  bodyPlain: string;
  bodyHtml: string | null;
  bodyExcerpt: string;
}) {
  const now = Date.now();
  
  db.prepare(`
    INSERT INTO job_email_bodies (
      gmail_message_id, body_plain, body_html, body_excerpt, stored_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(gmail_message_id) DO UPDATE SET
      body_plain = excluded.body_plain,
      body_html = excluded.body_html,
      body_excerpt = excluded.body_excerpt,
      stored_at = excluded.stored_at
  `).run(
    data.gmailMessageId,
    data.bodyPlain,
    data.bodyHtml,
    data.bodyExcerpt,
    now
  );
}

async function main() {
  const { limit, save } = parseArgs(process.argv);
  const GmailAuthModule = await import("../gmail-auth.js");
  const GmailAuth = GmailAuthModule.default || GmailAuthModule;
  const gmail = new (GmailAuth as any)();

  const { messages } = await gmail.fetchEmails({ maxResults: limit, query: "in:inbox" });
  if (!messages || messages.length === 0) {
    console.log("[]");
    return;
  }

  let db: Database.Database | null = null;
  let linker: ApplicationLinker | null = null;
  if (save) {
    const dbPath = getDbPath();
    await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    initNewSchema(db); // Ensure tables exist
    linker = new ApplicationLinker(db); // Initialize application linker
  }

  let processedCount = 0;
  let skippedCount = 0;
  let jobCount = 0;

  for (const msg of messages) {
    try {
      const headers = msg.payload?.headers || [];
      const subject = extractSubject(headers);
      const fromEmail = extractFromEmail(headers);
      const messageDate = extractDate(headers, msg.internalDate);
      const threadId = msg.threadId || null;
      const plaintext = extractPlaintextFromMessage(msg);
      const htmlBody = extractHtmlFromMessage(msg);
      const bodySha256 = computeBodySha256(plaintext);

      // Check if we need to reparse (only for job emails)
      if (save && db && !shouldReparse(db, msg.id, bodySha256)) {
        skippedCount++;
        console.log(`{"id":"${msg.id}","subject":"${subject}","skipped":true,"reason":"already_processed"}`);
        continue;
      }

      // Check if rule hint would be used
      const ruleHint = getStatusHint(subject, plaintext);
      const ruleHintUsed = !!ruleHint;

      const result = await parseEmailWithLLM({ subject, plaintext });

      // Only store if job-related
      if (result.is_job_related && save && db && linker) {
        // Validate status values
        const validStatuses = ["Applied", "Interview", "Declined", "Offer"];
        const validStatus = validStatuses.includes(result.status || "") ? result.status : null;
        
        upsertJobEmail(db, {
          gmailMessageId: msg.id,
          subject,
          company: result.company,
          position: result.position,
          status: validStatus,
          messageDate,
          threadId,
          fromEmail,
          ruleHintUsed
        });

        const bodyExcerpt = plaintext.slice(0, 400);
        upsertJobEmailBody(db, {
          gmailMessageId: msg.id,
          bodyPlain: plaintext,
          bodyHtml: htmlBody,
          bodyExcerpt
        });

        // Link email to application
        try {
          const applicationId = linker.linkEmail(
            msg.id,
            result.company,
            result.position,
            validStatus,
            subject,
            plaintext,
            fromEmail,
            headers,
            threadId,
            messageDate,
            [], // toEmails - not available in this context
            []  // ccEmails - not available in this context
          );
          
          // Add application info to output
          process.stdout.write(JSON.stringify({ 
            id: msg.id, 
            subject, 
            ...result, 
            application_id: applicationId 
          }) + "\n");
        } catch (linkError) {
          console.error(`Error linking email ${msg.id}:`, linkError);
          // Still output the original result
          process.stdout.write(JSON.stringify({ id: msg.id, subject, ...result }) + "\n");
        }

        jobCount++;
      } else {
        // Print JSON for each message (non-job-related or not saving)
        process.stdout.write(JSON.stringify({ id: msg.id, subject, ...result }) + "\n");
      }
      // If not job-related, we don't store anything - privacy!

      processedCount++;
    } catch (e) {
      console.error(`Error processing message ${msg?.id}:`, e);
    }
  }

  if (save && db) {
    console.error(`\nProcessing complete: ${processedCount} processed, ${skippedCount} skipped, ${jobCount} job-related emails stored`);
  }

  if (db) db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});