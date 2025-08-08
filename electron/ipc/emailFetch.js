const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

async function runEmailFetch(options = { limit: 50, save: true }) {
  try {
    // Import modules dynamically to handle TypeScript imports
    const { parseEmailWithLLM } = require('../llm/llmEngine');
    const { getDbPath, PROMPT_VERSION, MODEL_NAME } = require('../llm/config');
    const { initNewSchema } = require('../../scripts/initNewSchema');
    const { getStatusHint } = require('../llm/rules');
    const { ApplicationLinker } = require('../llm/linker/service');
    const Database = require('better-sqlite3');
    const { convert } = require('html-to-text');
    
    const GmailAuth = require('../gmail-auth.js');
    const gmail = new GmailAuth();

    // Check if authenticated
    const tokens = gmail.store.get('tokens');
    if (!tokens || !tokens.access_token) {
      throw new Error('Gmail not authenticated. Please connect Gmail first.');
    }

    const { messages } = await gmail.fetchEmails({ 
      maxResults: options.limit, 
      query: "in:inbox" 
    });
    
    if (!messages || messages.length === 0) {
      return { 
        success: true, 
        processedCount: 0, 
        jobCount: 0, 
        skippedCount: 0,
        message: 'No messages found'
      };
    }

    let db = null;
    let linker = null;
    if (options.save) {
      const dbPath = getDbPath();
      await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
      db = new Database(dbPath);
      initNewSchema(db);
      linker = new ApplicationLinker(db);
    }

    let processedCount = 0;
    let skippedCount = 0;
    let jobCount = 0;

    // Helper functions
    function decodeBase64Url(data) {
      const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(b64, "base64").toString("utf-8");
    }

    function extractSubject(headers) {
      return headers.find((h) => h.name === "Subject")?.value || "";
    }

    function extractFromEmail(headers) {
      return headers.find((h) => h.name === "From")?.value || "";
    }

    function extractDate(headers, internalDate) {
      const dateHeader = headers.find((h) => h.name === "Date")?.value;
      if (dateHeader) {
        const parsed = new Date(dateHeader).getTime();
        if (!isNaN(parsed)) return parsed;
      }
      return internalDate ? parseInt(internalDate, 10) : Date.now();
    }

    function extractPlaintextFromMessage(msg) {
      const payload = msg.payload;
      if (!payload) return "";

      if (payload.body && payload.body.data) {
        return decodeBase64Url(payload.body.data);
      }

      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === "text/plain" && part.body && part.body.data) {
            return decodeBase64Url(part.body.data);
          }
        }
        
        for (const part of payload.parts) {
          if (part.mimeType === "text/html" && part.body && part.body.data) {
            const html = decodeBase64Url(part.body.data);
            return convert(html, { wordwrap: 130 });
          }
        }
      }

      return "";
    }

    function extractHtmlFromMessage(msg) {
      const payload = msg.payload;
      if (!payload) return "";

      if (payload.mimeType === "text/html" && payload.body && payload.body.data) {
        return decodeBase64Url(payload.body.data);
      }

      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === "text/html" && part.body && part.body.data) {
            return decodeBase64Url(part.body.data);
          }
        }
      }

      return "";
    }

    function computeBodySha256(plaintext) {
      return crypto.createHash("sha256").update(plaintext.trim(), "utf-8").digest("hex");
    }

    function shouldReparse(db, messageId, bodySha256) {
      const existing = db.prepare("SELECT llm_body_sha256 FROM emails WHERE message_id = ?").get(messageId);
      if (!existing) return true;
      return existing.llm_body_sha256 !== bodySha256;
    }

    function saveEmail(db, data, now) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO emails (
          message_id, thread_id, subject, from_email, message_date, 
          body_text, body_html, llm_result, llm_body_sha256, 
          llm_prompt_version, llm_model_name, is_job_related, 
          processed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      return stmt.run(
        data.messageId,
        data.threadId,
        data.subject,
        data.fromEmail,
        data.messageDate,
        data.bodyText,
        data.bodyHtml,
        JSON.stringify(data.llmResult),
        data.bodySha256,
        data.promptVersion,
        data.modelName,
        data.isJobRelated ? 1 : 0,
        now,
        now,
        now
      );
    }

    function saveApplication(db, linker, emailId, llmResult, data, now) {
      // Implementation matches the original function
      if (!llmResult.applicationDetails) return null;
      
      const appData = {
        company: llmResult.applicationDetails.company || '',
        position: llmResult.applicationDetails.position || '',
        status: llmResult.applicationDetails.status || 'Applied',
        description: llmResult.applicationDetails.description || '',
        location: llmResult.applicationDetails.location || '',
        bodyExcerpt: data.bodyText.substring(0, 500)
      };

      return linker.processApplication(emailId, appData, data.subject, data.bodyText, now);
    }

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

        if (options.save && db && !shouldReparse(db, msg.id, bodySha256)) {
          skippedCount++;
          continue;
        }

        const statusHint = getStatusHint(subject, plaintext);
        const llmResult = await parseEmailWithLLM(plaintext, statusHint);

        const isJobRelated = llmResult && (llmResult.isJobRelated === true || llmResult.isJobRelated === "true");

        if (isJobRelated) {
          jobCount++;
        }

        if (options.save && db && isJobRelated) {
          const now = Date.now();
          
          const emailData = {
            messageId: msg.id,
            threadId,
            subject,
            fromEmail,
            messageDate,
            bodyText: plaintext,
            bodyHtml: htmlBody,
            llmResult,
            bodySha256,
            promptVersion: PROMPT_VERSION,
            modelName: MODEL_NAME,
            isJobRelated
          };

          const result = saveEmail(db, emailData, now);
          
          if (linker && result && result.lastInsertRowid) {
            saveApplication(db, linker, result.lastInsertRowid, llmResult, emailData, now);
          }
        }

        processedCount++;

      } catch (error) {
        console.error(`Error processing message ${msg.id}:`, error);
      }
    }

    if (db) {
      db.close();
    }

    return {
      success: true,
      processedCount,
      jobCount,
      skippedCount,
      message: `Processed ${processedCount} emails, found ${jobCount} job-related emails, skipped ${skippedCount}`
    };

  } catch (error) {
    console.error('Email fetch error:', error);
    throw error;
  }
}

function registerEmailFetchIPC() {
  ipcMain.handle('onlyjobs.emails.fetch', async (event, options) => {
    return await runEmailFetch(options || { limit: 50, save: true });
  });
}

module.exports = { registerEmailFetchIPC };