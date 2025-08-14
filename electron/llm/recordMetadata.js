/**
 * Record Metadata Management for LLM Processing
 * Handles tracking of record origins, processing context, and source validation
 */

const crypto = require('crypto');

/**
 * Record source types for tracking origin and processing requirements
 */
const RECORD_SOURCES = {
  LLM_PROCESSED: 'llm_processed',    // Records created via LLM email processing
  MANUAL_CREATED: 'manual_created',  // Records manually created by user
  USER_EDITED: 'user_edited',        // LLM records modified by user
  HYBRID: 'hybrid'                   // Records with both LLM and manual components
};

/**
 * Processing contexts for LLM system
 */
const PROCESSING_CONTEXTS = {
  EMAIL_CLASSIFICATION: 'email_classification',
  INDEED_SPECIALIZED: 'indeed_specialized',
  TWO_STAGE: 'two_stage_processing',
  FALLBACK: 'fallback_processing',
  MANUAL_BYPASS: 'manual_bypass'
};

/**
 * Data quality indicators for LLM extractions
 */
const DATA_QUALITY = {
  HIGH: 'high',      // Clear extraction with high confidence
  MEDIUM: 'medium',  // Reasonable extraction with moderate confidence
  LOW: 'low',        // Uncertain extraction requiring validation
  MANUAL: 'manual'   // User-provided data (highest trust)
};

class RecordMetadata {
  constructor(db) {
    this.db = db;
    this.initializeMetadataSchema();
  }

  /**
   * Initialize metadata tracking tables
   */
  initializeMetadataSchema() {
    this.db.exec(`
      -- Enhanced job_applications table with source tracking
      ALTER TABLE job_applications ADD COLUMN record_source TEXT DEFAULT 'llm_processed' CHECK (record_source IN ('llm_processed', 'manual_created', 'user_edited', 'hybrid'));
      ALTER TABLE job_applications ADD COLUMN creation_method TEXT DEFAULT 'email_processing';
      ALTER TABLE job_applications ADD COLUMN llm_confidence REAL;
      ALTER TABLE job_applications ADD COLUMN data_quality TEXT DEFAULT 'medium' CHECK (data_quality IN ('high', 'medium', 'low', 'manual'));
      ALTER TABLE job_applications ADD COLUMN original_extraction_data TEXT; -- JSON of original LLM extraction
      ALTER TABLE job_applications ADD COLUMN user_modifications TEXT; -- JSON of user edits
      ALTER TABLE job_applications ADD COLUMN processing_metadata TEXT; -- JSON of LLM processing context
      ALTER TABLE job_applications ADD COLUMN last_llm_processing DATETIME; -- When LLM last processed this record
      ALTER TABLE job_applications ADD COLUMN skip_llm_processing BOOLEAN DEFAULT 0; -- Flag to prevent re-processing

      -- LLM processing history for audit trail
      CREATE TABLE IF NOT EXISTS llm_processing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        email_id TEXT,
        processing_type TEXT NOT NULL, -- 'classification', 'parsing', 'indeed_specialized'
        model_version TEXT,
        prompt_version TEXT,
        input_hash TEXT, -- Hash of input content
        output_data TEXT, -- JSON of LLM output
        confidence_score REAL,
        processing_context TEXT, -- JSON of processing context
        processing_duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
      );

      -- Cache invalidation tracking
      CREATE TABLE IF NOT EXISTS cache_invalidation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        invalidation_reason TEXT NOT NULL, -- 'user_edit', 'data_correction', 'source_change'
        affected_caches TEXT, -- JSON array of cache keys affected
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
      );

      -- Manual record conflict tracking
      CREATE TABLE IF NOT EXISTS manual_record_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        email_id TEXT,
        conflict_type TEXT NOT NULL, -- 'duplicate_detection', 'data_mismatch', 'status_conflict'
        manual_data TEXT, -- JSON of manual record data
        llm_data TEXT, -- JSON of LLM-detected data
        resolution_strategy TEXT, -- 'prefer_manual', 'prefer_llm', 'merge', 'flag_for_review'
        resolved BOOLEAN DEFAULT 0,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_record_source ON job_applications(record_source);
      CREATE INDEX IF NOT EXISTS idx_skip_llm_processing ON job_applications(skip_llm_processing);
      CREATE INDEX IF NOT EXISTS idx_llm_processing_type ON llm_processing_history(processing_type);
      CREATE INDEX IF NOT EXISTS idx_processing_input_hash ON llm_processing_history(input_hash);
      CREATE INDEX IF NOT EXISTS idx_cache_invalidation_job ON cache_invalidation_log(job_id);
      CREATE INDEX IF NOT EXISTS idx_manual_conflicts_unresolved ON manual_record_conflicts(resolved, job_id);
    `);
  }

  /**
   * Create metadata for a new LLM-processed record
   */
  createLLMProcessedMetadata(jobId, extractionData, processingContext) {
    const metadata = {
      record_source: RECORD_SOURCES.LLM_PROCESSED,
      creation_method: processingContext.method || 'email_processing',
      llm_confidence: extractionData.confidence || 0.5,
      data_quality: this.assessDataQuality(extractionData),
      original_extraction_data: JSON.stringify(extractionData),
      processing_metadata: JSON.stringify({
        processing_type: processingContext.type || PROCESSING_CONTEXTS.EMAIL_CLASSIFICATION,
        model_version: processingContext.modelVersion,
        prompt_version: processingContext.promptVersion,
        email_indicators: extractionData.processing_context?.email_indicators || [],
        extraction_method: extractionData.processing_context?.extraction_method || 'direct_parsing',
        timestamp: new Date().toISOString()
      }),
      last_llm_processing: new Date().toISOString(),
      skip_llm_processing: 0
    };

    // Update job_applications table with metadata
    const updateStmt = this.db.prepare(`
      UPDATE job_applications 
      SET record_source = ?, creation_method = ?, llm_confidence = ?, 
          data_quality = ?, original_extraction_data = ?, processing_metadata = ?,
          last_llm_processing = ?, skip_llm_processing = ?
      WHERE job_id = ?
    `);

    updateStmt.run(
      metadata.record_source,
      metadata.creation_method,
      metadata.llm_confidence,
      metadata.data_quality,
      metadata.original_extraction_data,
      metadata.processing_metadata,
      metadata.last_llm_processing,
      metadata.skip_llm_processing,
      jobId
    );

    return metadata;
  }

  /**
   * Create metadata for a manually created record
   */
  createManualRecordMetadata(jobId, userData) {
    const metadata = {
      record_source: RECORD_SOURCES.MANUAL_CREATED,
      creation_method: 'manual_entry',
      data_quality: DATA_QUALITY.MANUAL,
      skip_llm_processing: 1, // Prevent LLM processing of manual records
      user_modifications: JSON.stringify({
        created_manually: true,
        creation_timestamp: new Date().toISOString(),
        user_data: userData
      })
    };

    const updateStmt = this.db.prepare(`
      UPDATE job_applications 
      SET record_source = ?, creation_method = ?, data_quality = ?, 
          skip_llm_processing = ?, user_modifications = ?
      WHERE job_id = ?
    `);

    updateStmt.run(
      metadata.record_source,
      metadata.creation_method,
      metadata.data_quality,
      metadata.skip_llm_processing,
      metadata.user_modifications,
      jobId
    );

    return metadata;
  }

  /**
   * Handle user editing of LLM-processed record
   */
  handleUserEdit(jobId, editedFields, originalData) {
    const existingRecord = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(jobId);
    
    if (!existingRecord) {
      throw new Error(`Job record ${jobId} not found`);
    }

    // Track the edit
    const editMetadata = {
      edited_at: new Date().toISOString(),
      edited_fields: Object.keys(editedFields),
      original_values: {},
      new_values: editedFields
    };

    // Capture original values for changed fields
    Object.keys(editedFields).forEach(field => {
      if (existingRecord[field] !== undefined) {
        editMetadata.original_values[field] = existingRecord[field];
      }
    });

    // Update record source if it was previously LLM-only
    let newRecordSource = existingRecord.record_source;
    if (existingRecord.record_source === RECORD_SOURCES.LLM_PROCESSED) {
      newRecordSource = RECORD_SOURCES.USER_EDITED;
    } else if (existingRecord.record_source === RECORD_SOURCES.MANUAL_CREATED) {
      newRecordSource = RECORD_SOURCES.MANUAL_CREATED; // Keep as manual
    }

    // Merge user modifications
    let userModifications = {};
    try {
      userModifications = JSON.parse(existingRecord.user_modifications || '{}');
    } catch (e) {
      userModifications = {};
    }

    userModifications.edits = userModifications.edits || [];
    userModifications.edits.push(editMetadata);

    // Update the record
    const updateStmt = this.db.prepare(`
      UPDATE job_applications 
      SET record_source = ?, user_modifications = ?, data_quality = ?, updated_at = CURRENT_TIMESTAMP
      WHERE job_id = ?
    `);

    updateStmt.run(
      newRecordSource,
      JSON.stringify(userModifications),
      DATA_QUALITY.MANUAL, // User edits are highest quality
      jobId
    );

    // Invalidate related caches
    this.invalidateCaches(jobId, 'user_edit', editedFields);

    return editMetadata;
  }

  /**
   * Check if a record should be processed by LLM
   */
  shouldProcessWithLLM(jobId) {
    const record = this.db.prepare(`
      SELECT record_source, skip_llm_processing, creation_method 
      FROM job_applications 
      WHERE job_id = ?
    `).get(jobId);

    if (!record) return true; // New record, process it

    // Never process manual records with LLM
    if (record.record_source === RECORD_SOURCES.MANUAL_CREATED) {
      return false;
    }

    // Check skip flag
    if (record.skip_llm_processing) {
      return false;
    }

    return true;
  }

  /**
   * Check for potential conflicts between manual and LLM data
   */
  detectManualLLMConflicts(jobId, llmData) {
    const record = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(jobId);
    
    if (!record || record.record_source === RECORD_SOURCES.LLM_PROCESSED) {
      return null; // No conflict for LLM-only records
    }

    const conflicts = [];
    const manualFields = ['company', 'job_title', 'location', 'status'];

    manualFields.forEach(field => {
      const manualValue = record[field];
      const llmValue = llmData[field];

      if (manualValue && llmValue && manualValue !== llmValue) {
        conflicts.push({
          field,
          manual_value: manualValue,
          llm_value: llmValue,
          confidence: llmData.confidence || 0.5
        });
      }
    });

    if (conflicts.length > 0) {
      // Log the conflict
      const conflictStmt = this.db.prepare(`
        INSERT INTO manual_record_conflicts 
        (job_id, conflict_type, manual_data, llm_data, resolution_strategy)
        VALUES (?, ?, ?, ?, ?)
      `);

      conflictStmt.run(
        jobId,
        'data_mismatch',
        JSON.stringify({ record_data: record }),
        JSON.stringify(llmData),
        'prefer_manual' // Default strategy
      );
    }

    return conflicts.length > 0 ? conflicts : null;
  }

  /**
   * Log LLM processing attempt
   */
  logLLMProcessing(jobId, emailId, processingType, modelVersion, promptVersion, inputData, outputData, duration) {
    const inputHash = crypto.createHash('sha256').update(JSON.stringify(inputData)).digest('hex');

    const logStmt = this.db.prepare(`
      INSERT INTO llm_processing_history 
      (job_id, email_id, processing_type, model_version, prompt_version, 
       input_hash, output_data, confidence_score, processing_duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    logStmt.run(
      jobId,
      emailId,
      processingType,
      modelVersion,
      promptVersion,
      inputHash,
      JSON.stringify(outputData),
      outputData.confidence || 0.5,
      duration
    );
  }

  /**
   * Invalidate caches related to a job record
   */
  invalidateCaches(jobId, reason, affectedData) {
    // Generate cache keys that need invalidation
    const cacheKeys = this.generateAffectedCacheKeys(jobId, affectedData);

    const invalidationStmt = this.db.prepare(`
      INSERT INTO cache_invalidation_log (job_id, invalidation_reason, affected_caches)
      VALUES (?, ?, ?)
    `);

    invalidationStmt.run(jobId, reason, JSON.stringify(cacheKeys));

    return cacheKeys;
  }

  /**
   * Assess data quality based on extraction results
   */
  assessDataQuality(extractionData) {
    const confidence = extractionData.confidence || 0.5;
    const hasKeyFields = !!(extractionData.company || extractionData.position);
    const hasStatus = !!extractionData.status;

    if (confidence >= 0.8 && hasKeyFields && hasStatus) {
      return DATA_QUALITY.HIGH;
    } else if (confidence >= 0.6 && hasKeyFields) {
      return DATA_QUALITY.MEDIUM;
    } else {
      return DATA_QUALITY.LOW;
    }
  }

  /**
   * Generate cache keys that might be affected by data changes
   */
  generateAffectedCacheKeys(jobId, affectedData) {
    const keys = [`job_${jobId}`];
    
    if (affectedData.company || affectedData.job_title) {
      keys.push(`company_${affectedData.company}`);
      keys.push(`title_${affectedData.job_title}`);
    }

    if (affectedData.email_content) {
      const emailHash = crypto.createHash('sha256').update(affectedData.email_content).digest('hex');
      keys.push(`email_${emailHash}`);
    }

    return keys;
  }

  /**
   * Get metadata for a job record
   */
  getRecordMetadata(jobId) {
    return this.db.prepare(`
      SELECT record_source, creation_method, llm_confidence, data_quality,
             original_extraction_data, user_modifications, processing_metadata,
             last_llm_processing, skip_llm_processing
      FROM job_applications 
      WHERE job_id = ?
    `).get(jobId);
  }

  /**
   * Get all manual records (for preventing LLM processing)
   */
  getManualRecords() {
    return this.db.prepare(`
      SELECT job_id, company, job_title, normalized_job_title, company_domain
      FROM job_applications 
      WHERE record_source IN ('manual_created', 'user_edited') 
      OR skip_llm_processing = 1
    `).all();
  }

  /**
   * Get unresolved conflicts for review
   */
  getUnresolvedConflicts() {
    return this.db.prepare(`
      SELECT mrc.*, ja.company, ja.job_title 
      FROM manual_record_conflicts mrc
      JOIN job_applications ja ON mrc.job_id = ja.job_id
      WHERE mrc.resolved = 0
      ORDER BY mrc.created_at DESC
    `).all();
  }
}

module.exports = {
  RecordMetadata,
  RECORD_SOURCES,
  PROCESSING_CONTEXTS,
  DATA_QUALITY
};