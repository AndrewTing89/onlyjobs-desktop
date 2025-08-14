/**
 * Integration API for Manual Record Handling
 * Provides clean interface between LLM system and frontend/fullstack components
 */

const EnhancedLLMEngine = require('./enhanced-llm-engine');
const { ManualRecordProcessor, ManualRecordConflictError, ValidationError } = require('./manual-record-processor');
const DuplicatePreventionSystem = require('./duplicate-prevention-system');
const { RECORD_SOURCES, EDIT_SOURCES } = require('./metadata-schema');

class LLMIntegrationAPI {
  constructor(database) {
    this.db = database;
    this.llmEngine = new EnhancedLLMEngine();
    this.manualProcessor = new ManualRecordProcessor(database, this.llmEngine);
    this.duplicateSystem = new DuplicatePreventionSystem(database, this.llmEngine);
    
    // Initialize enhanced database schema
    this.initializeEnhancedSchema();
  }

  /**
   * Initialize enhanced database schema for record tracking
   */
  initializeEnhancedSchema() {
    try {
      // Add record source tracking columns if they don't exist
      const columns = this.db.prepare("PRAGMA table_info(job_applications)").all();
      const hasRecordSource = columns.some(col => col.name === 'record_source');
      const hasLLMProcessed = columns.some(col => col.name === 'llm_processed');
      const hasFieldMetadata = columns.some(col => col.name === 'field_metadata');

      if (!hasRecordSource) {
        this.db.exec(`
          ALTER TABLE job_applications ADD COLUMN record_source TEXT DEFAULT 'llm_auto' 
          CHECK(record_source IN ('llm_auto', 'manual_created', 'manual_edited', 'hybrid'));
        `);
      }

      if (!hasLLMProcessed) {
        this.db.exec(`
          ALTER TABLE job_applications ADD COLUMN llm_processed BOOLEAN DEFAULT 0;
          ALTER TABLE job_applications ADD COLUMN llm_confidence REAL DEFAULT NULL;
          ALTER TABLE job_applications ADD COLUMN llm_model_version TEXT DEFAULT NULL;
          ALTER TABLE job_applications ADD COLUMN original_classification TEXT DEFAULT NULL;
        `);
      }

      if (!hasFieldMetadata) {
        this.db.exec(`
          ALTER TABLE job_applications ADD COLUMN field_metadata TEXT DEFAULT NULL;
        `);
      }

      // Create additional tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS job_edit_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          field_name TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          edit_source TEXT CHECK(edit_source IN ('llm_auto', 'manual_user', 'llm_reprocess')),
          editor_context TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
        );

        CREATE TABLE IF NOT EXISTS llm_email_cache (
          cache_key TEXT PRIMARY KEY,
          email_subject TEXT,
          email_from TEXT,
          content_hash TEXT,
          classification_result TEXT,
          model_version TEXT,
          confidence_score REAL,
          processing_time_ms INTEGER,
          record_source TEXT DEFAULT 'llm_auto',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME DEFAULT (datetime('now', '+30 days'))
        );

        CREATE INDEX IF NOT EXISTS idx_record_source ON job_applications(record_source);
        CREATE INDEX IF NOT EXISTS idx_llm_processed ON job_applications(llm_processed);
        CREATE INDEX IF NOT EXISTS idx_edit_source ON job_edit_history(edit_source);
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON llm_email_cache(expires_at);
      `);

      console.log('✅ Enhanced database schema initialized');
    } catch (error) {
      console.error('Failed to initialize enhanced schema:', error);
    }
  }

  /**
   * PUBLIC API: Create manual job record
   * Called from frontend when user manually creates a job application
   */
  async createManualJobRecord(recordData, userId = 'default') {
    try {
      // Validate input data
      this.validateJobRecordInput(recordData);

      // Check for duplicates before creation
      const duplicateCheck = await this.duplicateSystem.detectDuplicatesBeforeCreation({
        company: recordData.company,
        position: recordData.position,
        fromAddress: null,
        emailContent: null
      }, userId);

      // Handle duplicate prevention based on risk level
      if (duplicateCheck.riskAssessment.level === 'CRITICAL') {
        throw new ManualRecordConflictError(
          'Identical record already exists',
          duplicateCheck.matches.exact
        );
      }

      // Create the record
      const result = await this.manualProcessor.createManualRecord(recordData, userId);

      return {
        success: true,
        jobId: result.jobId,
        recordSource: RECORD_SOURCES.MANUAL_CREATED,
        duplicateWarnings: duplicateCheck.riskAssessment.level !== 'NONE' ? duplicateCheck : null,
        metadata: {
          created_at: new Date().toISOString(),
          llm_processed: false,
          user_created: true
        }
      };

    } catch (error) {
      if (error instanceof ManualRecordConflictError) {
        return {
          success: false,
          error: 'DUPLICATE_DETECTED',
          message: error.message,
          conflicts: error.conflicts,
          suggestions: this.generateConflictResolutionSuggestions(error.conflicts)
        };
      }

      if (error instanceof ValidationError) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.message
        };
      }

      throw error;
    }
  }

  /**
   * PUBLIC API: Edit existing job record
   * Called from frontend when user edits any job record (manual or LLM-created)
   */
  async editJobRecord(jobId, updates, userId = 'default') {
    try {
      // Get current record to understand its source
      const currentRecord = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(jobId);
      if (!currentRecord) {
        return {
          success: false,
          error: 'RECORD_NOT_FOUND',
          message: `Job record ${jobId} not found`
        };
      }

      // Validate updates
      this.validateJobRecordUpdates(updates);

      // Check if edits would create duplicates
      if (updates.company || updates.position) {
        const duplicateCheck = await this.duplicateSystem.detectDuplicatesBeforeCreation({
          company: updates.company || currentRecord.company,
          position: updates.position || currentRecord.job_title,
          fromAddress: null,
          emailContent: null
        }, userId);

        // Filter out the current record from duplicates
        duplicateCheck.matches.exact = duplicateCheck.matches.exact.filter(m => m.job_id !== jobId);
        
        if (duplicateCheck.matches.exact.length > 0) {
          return {
            success: false,
            error: 'EDIT_CREATES_DUPLICATE',
            message: 'These changes would create a duplicate record',
            conflicts: duplicateCheck.matches.exact
          };
        }
      }

      // Perform the edit
      const result = await this.manualProcessor.editRecord(jobId, updates, userId);

      return {
        success: true,
        jobId: result.jobId,
        changes: result.changes,
        recordSource: result.record_source,
        fieldChanges: result.field_changes,
        metadata: {
          edited_at: result.edit_metadata.edit_timestamp,
          original_source: result.edit_metadata.original_source,
          edit_count: result.changes
        }
      };

    } catch (error) {
      return {
        success: false,
        error: 'EDIT_FAILED',
        message: error.message
      };
    }
  }

  /**
   * PUBLIC API: Process email with manual record awareness
   * Enhanced version of email processing that considers existing manual records
   */
  async processEmailWithManualAwareness(emailData, userId = 'default', options = {}) {
    try {
      const {
        skipDuplicateCheck = false,
        forceProcess = false,
        linkToExisting = false
      } = options;

      // Get existing manual records for duplicate checking
      const existingRecords = this.getExistingRecords(userId);

      // Process email with enhanced context
      const llmResult = await this.llmEngine.parseEmailWithContext({
        ...emailData,
        recordSource: RECORD_SOURCES.LLM_AUTO,
        existingRecords,
        skipDuplicateCheck
      });

      if (!llmResult.is_job_related) {
        return {
          success: true,
          processed: false,
          reason: 'NOT_JOB_RELATED',
          confidence: llmResult.confidence
        };
      }

      // Check for conflicts with manual records
      const conflictAnalysis = await this.analyzeEmailConflicts(llmResult, existingRecords);

      if (conflictAnalysis.hasHighRiskConflicts && !forceProcess) {
        return {
          success: true,
          processed: false,
          reason: 'MANUAL_RECORD_CONFLICT',
          conflicts: conflictAnalysis.conflicts,
          llmResult,
          suggestions: this.generateEmailConflictSuggestions(conflictAnalysis)
        };
      }

      // If linking to existing record is requested
      if (linkToExisting && conflictAnalysis.bestMatch) {
        const linkResult = await this.linkEmailToExistingRecord(
          conflictAnalysis.bestMatch.job_id,
          emailData,
          llmResult
        );
        return {
          success: true,
          processed: true,
          linked: true,
          jobId: linkResult.jobId,
          action: 'LINKED_TO_EXISTING'
        };
      }

      // Create new record from email
      const jobId = await this.createJobFromEmail(emailData, llmResult, userId);

      return {
        success: true,
        processed: true,
        jobId,
        recordSource: RECORD_SOURCES.LLM_AUTO,
        llmResult,
        action: 'CREATED_NEW'
      };

    } catch (error) {
      return {
        success: false,
        error: 'PROCESSING_FAILED',
        message: error.message
      };
    }
  }

  /**
   * PUBLIC API: Get job record with full metadata
   * Returns comprehensive job information including source tracking
   */
  getJobRecordWithMetadata(jobId) {
    const record = this.db.prepare(`
      SELECT *,
             (SELECT COUNT(*) FROM job_edit_history WHERE job_id = ?) as total_edits,
             (SELECT COUNT(*) FROM job_emails WHERE job_id = ?) as email_count
      FROM job_applications 
      WHERE job_id = ?
    `).get(jobId, jobId, jobId);

    if (!record) return null;

    // Parse metadata fields
    try {
      record.parsed_field_metadata = JSON.parse(record.field_metadata || '{}');
      record.parsed_classification = JSON.parse(record.original_classification || '{}');
    } catch (e) {
      record.parsed_field_metadata = {};
      record.parsed_classification = {};
    }

    // Get edit history
    record.edit_history = this.db.prepare(`
      SELECT * FROM job_edit_history 
      WHERE job_id = ? 
      ORDER BY created_at DESC
      LIMIT 20
    `).all(jobId);

    // Get related emails
    record.emails = this.db.prepare(`
      SELECT * FROM job_emails 
      WHERE job_id = ? 
      ORDER BY email_date DESC
    `).all(jobId);

    // Add source information
    record.source_info = {
      is_manual_created: record.record_source === RECORD_SOURCES.MANUAL_CREATED,
      is_llm_processed: record.llm_processed === 1,
      has_user_edits: record.total_edits > 0,
      is_hybrid: record.record_source === RECORD_SOURCES.HYBRID,
      creation_method: this.getCreationMethodDescription(record.record_source)
    };

    return record;
  }

  /**
   * PUBLIC API: Resolve record conflicts
   * Handle conflicts between manual and automatic records
   */
  async resolveRecordConflict(conflictId, resolution, userId = 'default') {
    try {
      const { action, primaryJobId, secondaryJobId, mergeStrategy } = resolution;

      switch (action) {
        case 'MERGE_RECORDS':
          const mergeResult = await this.duplicateSystem.mergeDuplicateRecords(
            primaryJobId,
            secondaryJobId,
            mergeStrategy || 'prefer_manual'
          );
          return {
            success: true,
            action: 'MERGED',
            result: mergeResult
          };

        case 'KEEP_BOTH':
          // Mark as reviewed and keep both
          await this.markConflictResolved(conflictId, 'KEEP_BOTH');
          return {
            success: true,
            action: 'KEPT_BOTH'
          };

        case 'DELETE_DUPLICATE':
          this.db.prepare('DELETE FROM job_applications WHERE job_id = ?').run(secondaryJobId);
          return {
            success: true,
            action: 'DELETED',
            deletedJobId: secondaryJobId
          };

        default:
          throw new Error(`Unknown resolution action: ${action}`);
      }
    } catch (error) {
      return {
        success: false,
        error: 'RESOLUTION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * PUBLIC API: Get system statistics
   * Provides insights into manual vs automatic record creation
   */
  getSystemStatistics(userId = 'default', days = 30) {
    const stats = this.db.prepare(`
      SELECT 
        record_source,
        COUNT(*) as total_records,
        AVG(CASE WHEN llm_confidence IS NOT NULL THEN llm_confidence END) as avg_confidence,
        COUNT(CASE WHEN created_at > datetime('now', '-${days} days') THEN 1 END) as recent_records
      FROM job_applications 
      WHERE user_id = ?
      GROUP BY record_source
    `).all(userId);

    const duplicateStats = this.duplicateSystem.getDuplicateStatistics(userId, days);
    
    const editStats = this.db.prepare(`
      SELECT 
        edit_source,
        COUNT(*) as total_edits,
        COUNT(DISTINCT job_id) as jobs_edited
      FROM job_edit_history jeh
      JOIN job_applications ja ON jeh.job_id = ja.job_id
      WHERE ja.user_id = ?
      AND jeh.created_at > datetime('now', '-${days} days')
      GROUP BY edit_source
    `).all(userId);

    const cacheStats = this.db.prepare(`
      SELECT 
        record_source,
        COUNT(*) as cached_entries,
        AVG(confidence_score) as avg_confidence
      FROM llm_email_cache 
      WHERE created_at > datetime('now', '-${days} days')
      GROUP BY record_source
    `).all();

    return {
      records_by_source: stats,
      duplicate_analysis: duplicateStats,
      edit_activity: editStats,
      cache_performance: cacheStats,
      period_days: days,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * PRIVATE: Helper methods
   */

  validateJobRecordInput(recordData) {
    const required = ['company', 'position'];
    for (const field of required) {
      if (!recordData[field] || typeof recordData[field] !== 'string' || recordData[field].trim().length < 2) {
        throw new ValidationError(`${field} is required and must be at least 2 characters`);
      }
    }

    if (recordData.status && !['Applied', 'Interview', 'Declined', 'Offer'].includes(recordData.status)) {
      throw new ValidationError('Invalid status');
    }
  }

  validateJobRecordUpdates(updates) {
    const validFields = ['company', 'job_title', 'position', 'status', 'location', 'salary_range', 'notes', 'applied_date'];
    for (const field of Object.keys(updates)) {
      if (!validFields.includes(field)) {
        throw new ValidationError(`Invalid field for update: ${field}`);
      }
    }

    // Map 'position' to 'job_title' for database compatibility
    if (updates.position) {
      updates.job_title = updates.position;
      delete updates.position;
    }
  }

  getExistingRecords(userId) {
    return this.db.prepare(`
      SELECT job_id, company, job_title, record_source, created_at, status, company_domain
      FROM job_applications 
      WHERE user_id = ?
      AND created_at > datetime('now', '-180 days')
    `).all(userId);
  }

  async analyzeEmailConflicts(llmResult, existingRecords) {
    const conflicts = [];
    let hasHighRiskConflicts = false;
    let bestMatch = null;
    let highestSimilarity = 0;

    for (const record of existingRecords) {
      if (record.record_source === RECORD_SOURCES.MANUAL_CREATED || 
          record.record_source === RECORD_SOURCES.MANUAL_EDITED) {
        
        const similarity = this.calculateRecordSimilarity(llmResult, record);
        
        if (similarity > 0.8) {
          hasHighRiskConflicts = true;
        }

        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = record;
        }

        if (similarity > 0.6) {
          conflicts.push({
            job_id: record.job_id,
            similarity,
            record_source: record.record_source,
            conflict_type: similarity > 0.8 ? 'HIGH' : 'MEDIUM'
          });
        }
      }
    }

    return {
      hasHighRiskConflicts,
      conflicts,
      bestMatch: highestSimilarity > 0.6 ? bestMatch : null,
      highestSimilarity
    };
  }

  calculateRecordSimilarity(llmResult, record) {
    let score = 0;
    
    if (llmResult.company && record.company) {
      const companySim = this.calculateStringSimilarity(llmResult.company, record.company);
      score += companySim * 0.6;
    }
    
    if (llmResult.position && record.job_title) {
      const positionSim = this.calculateStringSimilarity(llmResult.position, record.job_title);
      score += positionSim * 0.4;
    }
    
    return score;
  }

  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    
    // Simple similarity calculation
    const maxLength = Math.max(s1.length, s2.length);
    const distance = this.levenshteinDistance(s1, s2);
    
    return (maxLength - distance) / maxLength;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
    for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  generateConflictResolutionSuggestions(conflicts) {
    return conflicts.map(conflict => ({
      action: 'MERGE_OR_UPDATE',
      target_job_id: conflict.recordId,
      description: `Consider updating existing record instead of creating new one`,
      confidence: conflict.confidence
    }));
  }

  generateEmailConflictSuggestions(conflictAnalysis) {
    const suggestions = [];
    
    if (conflictAnalysis.bestMatch) {
      suggestions.push({
        action: 'LINK_TO_EXISTING',
        target_job_id: conflictAnalysis.bestMatch.job_id,
        description: `Link this email to existing ${conflictAnalysis.bestMatch.company} application`,
        confidence: conflictAnalysis.highestSimilarity
      });
    }
    
    suggestions.push({
      action: 'CREATE_NEW',
      description: 'Create new job record despite similarities',
      confidence: 0.5
    });
    
    return suggestions;
  }

  async linkEmailToExistingRecord(jobId, emailData, llmResult) {
    // Implementation to link email to existing manual record
    // This would update the existing record with new email data
    return { jobId, linked: true };
  }

  async createJobFromEmail(emailData, llmResult, userId) {
    // Implementation to create new job record from email processing
    const jobId = `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const stmt = this.db.prepare(`
      INSERT INTO job_applications (
        job_id, user_id, company, job_title, status, record_source, 
        llm_processed, llm_confidence, original_classification, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      jobId,
      userId,
      llmResult.company,
      llmResult.position,
      llmResult.status,
      RECORD_SOURCES.LLM_AUTO,
      1,
      llmResult.confidence,
      JSON.stringify(llmResult),
      new Date().toISOString()
    );
    
    return jobId;
  }

  getCreationMethodDescription(recordSource) {
    const descriptions = {
      [RECORD_SOURCES.LLM_AUTO]: 'Automatically detected from email',
      [RECORD_SOURCES.MANUAL_CREATED]: 'Manually created by user',
      [RECORD_SOURCES.MANUAL_EDITED]: 'LLM-created, user-edited',
      [RECORD_SOURCES.HYBRID]: 'Combined manual and automatic data'
    };
    return descriptions[recordSource] || 'Unknown';
  }

  async markConflictResolved(conflictId, resolution) {
    // Implementation to mark conflict as resolved
    // This could be stored in a separate conflicts table
  }
}

module.exports = {
  LLMIntegrationAPI,
  RECORD_SOURCES,
  EDIT_SOURCES
};