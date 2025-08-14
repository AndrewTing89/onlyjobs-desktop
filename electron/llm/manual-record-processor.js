/**
 * Manual Record Processor
 * Handles creation, editing, and validation of manual job records
 * Ensures they don't interfere with automatic LLM processing
 */

const { RECORD_SOURCES, EDIT_SOURCES } = require('./metadata-schema');
const EnhancedLLMEngine = require('./enhanced-llm-engine');

class ManualRecordProcessor {
  constructor(database, llmEngine = null) {
    this.db = database;
    this.llmEngine = llmEngine || new EnhancedLLMEngine();
    this.conflictResolver = new RecordConflictResolver(database);
  }

  /**
   * Create a new manual job record with proper metadata
   */
  async createManualRecord(recordData, userId = 'default') {
    const {
      company,
      position,
      status = 'Applied',
      location = null,
      salary_range = null,
      notes = null,
      applied_date = null
    } = recordData;

    // Validate required fields
    this.validateManualRecord(recordData);

    // Check for potential conflicts with existing records
    const conflictAnalysis = await this.analyzeForConflicts(recordData, userId);
    
    if (conflictAnalysis.hasHighRiskConflicts) {
      throw new ManualRecordConflictError(
        'Potential duplicate record detected',
        conflictAnalysis.conflicts
      );
    }

    const jobId = this.generateJobId('manual');
    const timestamp = new Date().toISOString();

    // Create record with manual source metadata
    const insertStmt = this.db.prepare(`
      INSERT INTO job_applications (
        job_id, user_id, company, job_title, status, location,
        salary_range, notes, applied_date, record_source, llm_processed,
        created_at, updated_at, first_contact_date, last_contact_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      jobId,
      userId,
      company,
      position,
      status,
      location,
      salary_range,
      notes,
      applied_date || timestamp,
      RECORD_SOURCES.MANUAL_CREATED,
      0, // Not LLM processed
      timestamp,
      timestamp,
      applied_date || timestamp,
      applied_date || timestamp
    );

    // Log creation in edit history
    await this.logEdit(jobId, 'record_created', null, 'Manual record creation', EDIT_SOURCES.MANUAL_USER);

    // Initialize field metadata
    await this.initializeFieldMetadata(jobId, recordData);

    return {
      jobId,
      record_source: RECORD_SOURCES.MANUAL_CREATED,
      conflicts: conflictAnalysis.lowRiskConflicts,
      metadata: {
        created_manually: true,
        creation_timestamp: timestamp,
        user_id: userId
      }
    };
  }

  /**
   * Edit an existing record while preserving LLM metadata
   */
  async editRecord(jobId, updates, userId = 'default') {
    // Get current record
    const currentRecord = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(jobId);
    if (!currentRecord) {
      throw new Error(`Job record ${jobId} not found`);
    }

    const editMetadata = {
      edit_timestamp: new Date().toISOString(),
      original_source: currentRecord.record_source,
      user_id: userId
    };

    // Determine new record source based on edit type
    let newRecordSource = currentRecord.record_source;
    if (currentRecord.record_source === RECORD_SOURCES.LLM_AUTO) {
      newRecordSource = RECORD_SOURCES.MANUAL_EDITED;
    } else if (currentRecord.record_source === RECORD_SOURCES.MANUAL_EDITED) {
      newRecordSource = RECORD_SOURCES.HYBRID;
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    const editHistory = [];

    for (const [field, newValue] of Object.entries(updates)) {
      if (this.isValidEditField(field) && currentRecord[field] !== newValue) {
        updateFields.push(`${field} = ?`);
        updateValues.push(newValue);
        
        // Log the specific field change
        editHistory.push({
          field,
          oldValue: currentRecord[field],
          newValue,
          edit_source: EDIT_SOURCES.MANUAL_USER
        });
      }
    }

    if (updateFields.length === 0) {
      return { jobId, changes: 0, message: 'No changes detected' };
    }

    // Update record source and timestamp
    updateFields.push('record_source = ?', 'updated_at = ?');
    updateValues.push(newRecordSource, editMetadata.edit_timestamp);

    const updateStmt = this.db.prepare(`
      UPDATE job_applications 
      SET ${updateFields.join(', ')}
      WHERE job_id = ?
    `);

    updateStmt.run(...updateValues, jobId);

    // Log all field changes
    for (const edit of editHistory) {
      await this.logEdit(
        jobId,
        edit.field,
        edit.oldValue,
        edit.newValue,
        edit.edit_source,
        editMetadata
      );
    }

    // Update field metadata
    await this.updateFieldMetadata(jobId, updates, editMetadata);

    // Invalidate related LLM cache if necessary
    if (currentRecord.llm_processed) {
      this.llmEngine.invalidateCacheForJob(jobId, newRecordSource);
    }

    return {
      jobId,
      changes: editHistory.length,
      record_source: newRecordSource,
      edit_metadata: editMetadata,
      field_changes: editHistory
    };
  }

  /**
   * Validate manual record data
   */
  validateManualRecord(recordData) {
    const { company, position } = recordData;
    
    if (!company || typeof company !== 'string' || company.trim().length < 2) {
      throw new ValidationError('Company name is required and must be at least 2 characters');
    }
    
    if (!position || typeof position !== 'string' || position.trim().length < 2) {
      throw new ValidationError('Position is required and must be at least 2 characters');
    }

    if (recordData.status && !['Applied', 'Interview', 'Declined', 'Offer'].includes(recordData.status)) {
      throw new ValidationError('Invalid status. Must be one of: Applied, Interview, Declined, Offer');
    }
  }

  /**
   * Analyze for potential conflicts with existing records
   */
  async analyzeForConflicts(recordData, userId) {
    const { company, position } = recordData;
    
    // Find potentially similar records
    const similarRecords = this.db.prepare(`
      SELECT job_id, company, job_title, record_source, created_at,
             similarity_score(company, ?) as company_sim,
             similarity_score(job_title, ?) as position_sim
      FROM job_applications 
      WHERE user_id = ?
      AND (
        similarity_score(company, ?) > 0.7 
        OR similarity_score(job_title, ?) > 0.7
        OR (company = ? AND job_title = ?)
      )
      ORDER BY (company_sim + position_sim) DESC
      LIMIT 10
    `).all(company, position, userId, company, position, company, position);

    const conflicts = [];
    let hasHighRiskConflicts = false;

    for (const record of similarRecords) {
      const riskLevel = this.assessConflictRisk(recordData, record);
      conflicts.push({
        jobId: record.job_id,
        riskLevel,
        similarity: {
          company: record.company_sim,
          position: record.position_sim
        },
        existingRecord: {
          company: record.company,
          position: record.job_title,
          source: record.record_source
        }
      });

      if (riskLevel === 'high') {
        hasHighRiskConflicts = true;
      }
    }

    return {
      hasHighRiskConflicts,
      conflicts,
      highRiskConflicts: conflicts.filter(c => c.riskLevel === 'high'),
      lowRiskConflicts: conflicts.filter(c => c.riskLevel === 'low')
    };
  }

  /**
   * Assess conflict risk between records
   */
  assessConflictRisk(newRecord, existingRecord) {
    const companySim = this.calculateStringSimilarity(newRecord.company, existingRecord.company);
    const positionSim = this.calculateStringSimilarity(newRecord.position, existingRecord.job_title);
    
    if (companySim > 0.9 && positionSim > 0.9) {
      return 'high'; // Likely duplicate
    } else if (companySim > 0.8 || positionSim > 0.8) {
      return 'medium'; // Possible duplicate
    } else {
      return 'low'; // Unlikely duplicate
    }
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(s1, s2);
    return (maxLength - distance) / maxLength;
  }

  /**
   * Levenshtein distance calculation
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
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

  /**
   * Log edit in history table
   */
  async logEdit(jobId, fieldName, oldValue, newValue, editSource, metadata = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO job_edit_history (
        job_id, field_name, old_value, new_value, edit_source, editor_context
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      jobId,
      fieldName,
      oldValue,
      newValue,
      editSource,
      JSON.stringify(metadata)
    );
  }

  /**
   * Initialize field metadata for new manual record
   */
  async initializeFieldMetadata(jobId, recordData) {
    const fieldMetadata = {};
    const timestamp = new Date().toISOString();
    
    for (const [field, value] of Object.entries(recordData)) {
      if (value !== null && value !== undefined) {
        fieldMetadata[field] = {
          source: 'manual_user',
          confidence: 1.0,
          last_modified: timestamp,
          original_llm_value: null,
          user_override: false
        };
      }
    }

    // Store metadata as JSON in job record (or separate table if preferred)
    this.db.prepare(`
      UPDATE job_applications 
      SET field_metadata = ?
      WHERE job_id = ?
    `).run(JSON.stringify(fieldMetadata), jobId);
  }

  /**
   * Update field metadata for edited records
   */
  async updateFieldMetadata(jobId, updates, editMetadata) {
    const currentRecord = this.db.prepare('SELECT field_metadata FROM job_applications WHERE job_id = ?').get(jobId);
    let fieldMetadata = {};
    
    try {
      fieldMetadata = JSON.parse(currentRecord.field_metadata || '{}');
    } catch (e) {
      console.warn('Failed to parse field metadata, initializing new');
    }

    for (const [field, newValue] of Object.entries(updates)) {
      if (!fieldMetadata[field]) {
        fieldMetadata[field] = {};
      }
      
      fieldMetadata[field] = {
        ...fieldMetadata[field],
        source: 'manual_user',
        confidence: 1.0,
        last_modified: editMetadata.edit_timestamp,
        user_override: true
      };
    }

    this.db.prepare(`
      UPDATE job_applications 
      SET field_metadata = ?
      WHERE job_id = ?
    `).run(JSON.stringify(fieldMetadata), jobId);
  }

  /**
   * Check if field is valid for editing
   */
  isValidEditField(field) {
    const validFields = [
      'company', 'job_title', 'status', 'location', 
      'salary_range', 'notes', 'applied_date'
    ];
    return validFields.includes(field);
  }

  /**
   * Generate unique job ID with source prefix
   */
  generateJobId(source = 'manual') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${source}_${timestamp}_${random}`;
  }

  /**
   * Get manual record with full metadata
   */
  getManualRecordWithMetadata(jobId) {
    const record = this.db.prepare(`
      SELECT *, 
             (SELECT COUNT(*) FROM job_edit_history WHERE job_id = ?) as edit_count
      FROM job_applications 
      WHERE job_id = ?
    `).get(jobId, jobId);

    if (!record) return null;

    // Get edit history
    record.edit_history = this.db.prepare(`
      SELECT * FROM job_edit_history 
      WHERE job_id = ? 
      ORDER BY created_at DESC
    `).all(jobId);

    // Parse field metadata
    try {
      record.parsed_field_metadata = JSON.parse(record.field_metadata || '{}');
    } catch (e) {
      record.parsed_field_metadata = {};
    }

    return record;
  }

  /**
   * Merge manual record with LLM processing if needed
   */
  async mergeWithLLMData(jobId, emailData) {
    const manualRecord = this.getManualRecordWithMetadata(jobId);
    if (!manualRecord || manualRecord.record_source === RECORD_SOURCES.LLM_AUTO) {
      return null; // Not a manual record or already processed
    }

    // Use LLM to extract additional data from email
    const llmResult = await this.llmEngine.parseEmailWithContext({
      ...emailData,
      recordSource: RECORD_SOURCES.HYBRID,
      existingRecords: [manualRecord],
      skipDuplicateCheck: true
    });

    if (!llmResult.is_job_related) {
      return manualRecord; // Email not job-related, keep manual record as-is
    }

    // Intelligently merge data
    const mergedData = this.intelligentMerge(manualRecord, llmResult);
    
    // Update record with hybrid source
    await this.editRecord(jobId, mergedData, 'llm_enhancement');

    return this.getManualRecordWithMetadata(jobId);
  }

  /**
   * Intelligently merge manual and LLM data
   */
  intelligentMerge(manualRecord, llmResult) {
    const merged = {};
    
    // Company: prefer manual unless LLM has higher confidence
    if (!manualRecord.company && llmResult.company && llmResult.confidence > 0.8) {
      merged.company = llmResult.company;
    }
    
    // Position: prefer manual unless LLM has much more detail
    if (!manualRecord.job_title && llmResult.position && llmResult.confidence > 0.8) {
      merged.job_title = llmResult.position;
    }
    
    // Status: update if LLM detected a progression (Applied -> Interview -> Offer/Declined)
    if (this.isStatusProgression(manualRecord.status, llmResult.status)) {
      merged.status = llmResult.status;
    }

    return merged;
  }

  /**
   * Check if status represents a progression
   */
  isStatusProgression(currentStatus, newStatus) {
    const statusOrder = ['Applied', 'Interview', 'Offer', 'Declined'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    const newIndex = statusOrder.indexOf(newStatus);
    
    // Allow progression forward, but not backward (except to Declined)
    return newIndex > currentIndex || newStatus === 'Declined';
  }
}

/**
 * Custom error classes
 */
class ManualRecordConflictError extends Error {
  constructor(message, conflicts) {
    super(message);
    this.name = 'ManualRecordConflictError';
    this.conflicts = conflicts;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Record conflict resolution helper
 */
class RecordConflictResolver {
  constructor(database) {
    this.db = database;
  }

  /**
   * Suggest resolution for record conflicts
   */
  suggestResolution(conflicts) {
    return conflicts.map(conflict => ({
      ...conflict,
      suggestedAction: this.determineBestAction(conflict),
      mergeStrategy: this.suggestMergeStrategy(conflict)
    }));
  }

  determineBestAction(conflict) {
    if (conflict.riskLevel === 'high') {
      return 'merge_or_skip';
    } else if (conflict.riskLevel === 'medium') {
      return 'review_and_decide';
    } else {
      return 'create_separate';
    }
  }

  suggestMergeStrategy(conflict) {
    // Implementation for suggesting how to merge conflicting records
    return {
      preserveManual: ['notes', 'salary_range'],
      preferLLM: ['status'],
      combineIfDifferent: ['location']
    };
  }
}

module.exports = {
  ManualRecordProcessor,
  ManualRecordConflictError,
  ValidationError,
  RecordConflictResolver
};