/**
 * Extraction Manager for Email Pipeline
 * Handles LLM extraction results and stores them in the pipeline table
 */

const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const { extractStage2, fallbackExtraction } = require('../llm/two-stage-classifier');

// Shared database connection
let sharedDb = null;

function getSharedDb() {
  if (!sharedDb) {
    const dbPath = path.join(app.getPath('userData'), 'jobs.db');
    sharedDb = new Database(dbPath);
    sharedDb.pragma('foreign_keys = ON');
  }
  return sharedDb;
}

class ExtractionManager {
  constructor() {
    this.db = getSharedDb();
  }

  /**
   * Append extraction attempt to pipeline record
   */
  async appendExtraction(gmailMessageId, accountEmail, extraction, testRunId = null) {
    try {
      // Get current extraction attempts
      const current = this.db.prepare(`
        SELECT extraction_attempts 
        FROM email_pipeline 
        WHERE gmail_message_id = ? AND account_email = ?
      `).get(gmailMessageId, accountEmail);

      let attempts = [];
      if (current && current.extraction_attempts) {
        try {
          attempts = JSON.parse(current.extraction_attempts);
        } catch (e) {
          console.error('Error parsing existing attempts:', e);
          attempts = [];
        }
      }

      // Add new extraction with timestamp
      const newAttempt = {
        ...extraction,
        test_run_id: testRunId,
        extracted_at: new Date().toISOString()
      };
      attempts.push(newAttempt);

      // Update pipeline with new extraction
      const stmt = this.db.prepare(`
        UPDATE email_pipeline 
        SET 
          extraction_attempts = ?,
          pipeline_stage = CASE 
            WHEN pipeline_stage IN ('extraction_pending', 'ml_classified') 
            THEN 'extraction_complete' 
            ELSE pipeline_stage 
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE gmail_message_id = ? AND account_email = ?
      `);

      stmt.run(JSON.stringify(attempts), gmailMessageId, accountEmail);
      
      console.log(`Appended extraction for ${gmailMessageId} with model ${extraction.model_id}`);
      return true;
    } catch (error) {
      console.error('Error appending extraction:', error);
      throw error;
    }
  }

  /**
   * Extract job details for emails in pipeline
   */
  async extractPendingEmails(modelId, modelPath, testRunId = null, limit = 100) {
    try {
      // Get emails pending extraction
      const pending = this.db.prepare(`
        SELECT 
          gmail_message_id, 
          account_email, 
          subject, 
          from_address, 
          body,
          ml_confidence
        FROM email_pipeline
        WHERE pipeline_stage = 'extraction_pending'
        AND ml_is_job_related = 1
        ORDER BY ml_confidence DESC
        LIMIT ?
      `).all(limit);

      console.log(`Found ${pending.length} emails pending extraction`);

      const results = [];
      for (const email of pending) {
        try {
          const startTime = Date.now();
          
          // Try LLM extraction
          let extractionResult;
          try {
            extractionResult = await extractStage2(
              modelId, 
              modelPath, 
              email.subject, 
              email.body, 
              email.from_address
            );
          } catch (llmError) {
            console.error('LLM extraction failed, using fallback:', llmError);
            extractionResult = fallbackExtraction(email.subject, email.body, email.from_address);
          }

          const extractionTime = Date.now() - startTime;

          // Build extraction record
          const extraction = {
            model_id: modelId,
            extracted: {
              company: extractionResult.company || null,
              position: extractionResult.position || null,
              status: extractionResult.status || null,
              location: extractionResult.location || null,
              remote_status: extractionResult.remote_status || null,
              salary_range: extractionResult.salary_range || null
            },
            extraction_time_ms: extractionTime,
            raw_response: extractionResult.raw_response || JSON.stringify(extractionResult)
          };

          // Append to pipeline
          await this.appendExtraction(
            email.gmail_message_id, 
            email.account_email, 
            extraction, 
            testRunId
          );

          results.push({
            gmail_message_id: email.gmail_message_id,
            success: true,
            extraction
          });

        } catch (error) {
          console.error(`Failed to extract ${email.gmail_message_id}:`, error);
          results.push({
            gmail_message_id: email.gmail_message_id,
            success: false,
            error: error.message
          });
        }
      }

      return {
        processed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (error) {
      console.error('Error in extractPendingEmails:', error);
      throw error;
    }
  }

  /**
   * Select best extraction from attempts
   */
  async selectBestExtraction(gmailMessageId, accountEmail, method = 'auto_best') {
    try {
      const record = this.db.prepare(`
        SELECT extraction_attempts 
        FROM email_pipeline 
        WHERE gmail_message_id = ? AND account_email = ?
      `).get(gmailMessageId, accountEmail);

      if (!record || !record.extraction_attempts) {
        throw new Error('No extraction attempts found');
      }

      const attempts = JSON.parse(record.extraction_attempts);
      if (attempts.length === 0) {
        throw new Error('No extraction attempts to select from');
      }

      let selected;
      let selectedModelId;

      switch (method) {
        case 'auto_best':
          // Select based on completeness and speed
          selected = attempts.reduce((best, current) => {
            const currentScore = this.scoreExtraction(current.extracted);
            const bestScore = this.scoreExtraction(best.extracted);
            
            if (currentScore > bestScore) return current;
            if (currentScore === bestScore && current.extraction_time_ms < best.extraction_time_ms) {
              return current;
            }
            return best;
          });
          selectedModelId = selected.model_id;
          break;

        case 'consensus':
          // Find most common values across all attempts
          selected = this.findConsensus(attempts);
          selectedModelId = 'consensus';
          break;

        case 'fastest':
          // Select fastest extraction
          selected = attempts.reduce((fastest, current) => 
            current.extraction_time_ms < fastest.extraction_time_ms ? current : fastest
          );
          selectedModelId = selected.model_id;
          break;

        default:
          // Use first attempt as fallback
          selected = attempts[0];
          selectedModelId = selected.model_id;
      }

      // Update pipeline with selected extraction
      const stmt = this.db.prepare(`
        UPDATE email_pipeline 
        SET 
          selected_extraction = ?,
          selected_model_id = ?,
          selection_method = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE gmail_message_id = ? AND account_email = ?
      `);

      stmt.run(
        JSON.stringify(selected.extracted),
        selectedModelId,
        method,
        gmailMessageId,
        accountEmail
      );

      return selected;
    } catch (error) {
      console.error('Error selecting best extraction:', error);
      throw error;
    }
  }

  /**
   * Score extraction completeness
   */
  scoreExtraction(extracted) {
    let score = 0;
    if (extracted.company) score += 3;  // Company is most important
    if (extracted.position) score += 2;
    if (extracted.status) score += 2;
    if (extracted.location) score += 1;
    if (extracted.remote_status) score += 1;
    if (extracted.salary_range) score += 1;
    return score;
  }

  /**
   * Find consensus values across multiple extractions
   */
  findConsensus(attempts) {
    const fields = ['company', 'position', 'status', 'location', 'remote_status', 'salary_range'];
    const consensus = { extracted: {} };

    for (const field of fields) {
      const values = attempts
        .map(a => a.extracted[field])
        .filter(v => v !== null && v !== undefined);
      
      if (values.length === 0) {
        consensus.extracted[field] = null;
        continue;
      }

      // Find most common value
      const counts = {};
      for (const value of values) {
        counts[value] = (counts[value] || 0) + 1;
      }
      
      const mostCommon = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])[0];
      
      consensus.extracted[field] = mostCommon ? mostCommon[0] : null;
    }

    return consensus;
  }

  /**
   * Get comparison of all extractions for an email
   */
  async getExtractionComparison(gmailMessageId, accountEmail) {
    try {
      const record = this.db.prepare(`
        SELECT 
          subject,
          from_address,
          extraction_attempts,
          selected_extraction,
          selected_model_id,
          selection_method
        FROM email_pipeline 
        WHERE gmail_message_id = ? AND account_email = ?
      `).get(gmailMessageId, accountEmail);

      if (!record) {
        return null;
      }

      const attempts = record.extraction_attempts ? JSON.parse(record.extraction_attempts) : [];
      const selected = record.selected_extraction ? JSON.parse(record.selected_extraction) : null;

      return {
        email: {
          subject: record.subject,
          from: record.from_address
        },
        attempts: attempts.map(a => ({
          model_id: a.model_id,
          extraction_time_ms: a.extraction_time_ms,
          extracted: a.extracted
        })),
        selected: {
          extraction: selected,
          model_id: record.selected_model_id,
          method: record.selection_method
        }
      };
    } catch (error) {
      console.error('Error getting extraction comparison:', error);
      throw error;
    }
  }

  /**
   * Clear extractions for a specific model
   */
  async clearModelExtractions(modelId, testRunId = null) {
    try {
      const condition = testRunId 
        ? `json_extract(value, '$.model_id') = ? AND json_extract(value, '$.test_run_id') = ?`
        : `json_extract(value, '$.model_id') = ?`;
      
      const params = testRunId ? [modelId, testRunId] : [modelId];

      // Remove specific model's extractions from all records
      const stmt = this.db.prepare(`
        UPDATE email_pipeline 
        SET 
          extraction_attempts = (
            SELECT json_group_array(value)
            FROM json_each(extraction_attempts)
            WHERE NOT (${condition})
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE extraction_attempts IS NOT NULL
      `);

      const result = stmt.run(...params);
      
      console.log(`Cleared ${result.changes} extraction attempts for model ${modelId}`);
      return result.changes;
    } catch (error) {
      console.error('Error clearing model extractions:', error);
      throw error;
    }
  }

  /**
   * Get model performance statistics
   */
  async getModelPerformance(modelId = null) {
    try {
      let query;
      let params = [];

      if (modelId) {
        query = `
          SELECT 
            json_extract(value, '$.model_id') as model_id,
            COUNT(*) as total_extractions,
            AVG(json_extract(value, '$.extraction_time_ms')) as avg_time_ms,
            MIN(json_extract(value, '$.extraction_time_ms')) as min_time_ms,
            MAX(json_extract(value, '$.extraction_time_ms')) as max_time_ms
          FROM email_pipeline, json_each(extraction_attempts)
          WHERE json_extract(value, '$.model_id') = ?
          GROUP BY json_extract(value, '$.model_id')
        `;
        params = [modelId];
      } else {
        query = `
          SELECT 
            json_extract(value, '$.model_id') as model_id,
            COUNT(*) as total_extractions,
            AVG(json_extract(value, '$.extraction_time_ms')) as avg_time_ms,
            MIN(json_extract(value, '$.extraction_time_ms')) as min_time_ms,
            MAX(json_extract(value, '$.extraction_time_ms')) as max_time_ms
          FROM email_pipeline, json_each(extraction_attempts)
          WHERE extraction_attempts IS NOT NULL
          GROUP BY json_extract(value, '$.model_id')
        `;
      }

      return this.db.prepare(query).all(...params);
    } catch (error) {
      console.error('Error getting model performance:', error);
      throw error;
    }
  }
}

module.exports = ExtractionManager;