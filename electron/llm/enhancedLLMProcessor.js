/**
 * Enhanced LLM Processor for Mixed Record Sources
 * Integrates all components for optimal manual/automatic record handling
 */

const { RecordMetadata, RECORD_SOURCES, DATA_QUALITY } = require('./recordMetadata');
const RecordSourceValidator = require('./recordSourceValidator');
const { ConflictResolver, RESOLUTION_STRATEGIES } = require('./conflictResolver');
const EnhancedCacheManager = require('./enhancedCacheManager');
const PerformanceMonitor = require('./performanceMonitor');
const { parseEmailWithTwoStage, parseEmailWithLLM, classifyEmail } = require('./llmEngine');

class EnhancedLLMProcessor {
  constructor(db) {
    this.db = db;
    
    // Initialize all components
    this.recordMetadata = new RecordMetadata(db);
    this.sourceValidator = new RecordSourceValidator(db);
    this.conflictResolver = new ConflictResolver(db);
    this.cacheManager = new EnhancedCacheManager();
    this.performanceMonitor = new PerformanceMonitor(db);
    
    // Processing configuration
    this.config = {
      enableTwoStageProcessing: process.env.ONLYJOBS_USE_TWO_STAGE !== 'false',
      enableConflictResolution: true,
      enablePerformanceTracking: true,
      maxProcessingTime: 15000, // 15 seconds timeout
      cacheEnabled: true
    };

    this.setupEventHandlers();
    this.initializeProcessor();
  }

  /**
   * Initialize the processor and load manual records index
   */
  async initializeProcessor() {
    try {
      // Load manual records for validation
      await this.sourceValidator.loadManualRecordsIndex();
      
      // Start performance monitoring
      if (this.config.enablePerformanceTracking) {
        this.performanceMonitor.startPeriodicCollection();
      }

      console.log('✅ Enhanced LLM Processor initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced LLM Processor:', error);
      throw error;
    }
  }

  /**
   * Setup event handlers for component communication
   */
  setupEventHandlers() {
    // Performance monitoring events
    this.performanceMonitor.on('performance_alert', (alert) => {
      console.warn('⚠️ Performance Alert:', alert);
    });

    this.performanceMonitor.on('llm_processing_recorded', (data) => {
      if (data.duration > 10000) { // Log slow processing
        console.log(`🐌 Slow LLM processing detected: ${data.duration}ms`);
      }
    });

    // Conflict resolution events
    this.conflictResolver.on('conflict_resolved', (resolution) => {
      console.log(`🔧 Conflict resolved for job ${resolution.jobId}`);
    });
  }

  /**
   * Main email processing entry point with comprehensive validation
   */
  async processEmail(emailData, options = {}) {
    const startTime = Date.now();
    const processingId = this.generateProcessingId();
    
    try {
      console.log(`🚀 Processing email: ${emailData.subject} (ID: ${processingId})`);

      // Step 1: Pre-processing validation
      const validationResult = await this.preProcessValidation(emailData);
      
      if (!validationResult.shouldProcess) {
        const duration = Date.now() - startTime;
        
        // Record the skip
        this.performanceMonitor.recordLLMProcessing({
          processingType: 'validation_skip',
          duration,
          success: true,
          cacheHit: false,
          inputSize: this.calculateInputSize(emailData),
          confidence: 0
        });

        return {
          processed: false,
          reason: validationResult.reason,
          manualRecordRisk: validationResult.manualRecordRisk,
          conflictingRecord: validationResult.conflictingRecord,
          processingId
        };
      }

      // Step 2: LLM Processing with caching
      const llmResult = await this.performLLMProcessing(emailData, options);
      
      // Step 3: Conflict detection and resolution
      const conflictResult = await this.handleConflicts(llmResult, validationResult);
      
      // Step 4: Record creation/update with metadata
      const jobId = await this.createOrUpdateRecord(llmResult, conflictResult, emailData);
      
      const duration = Date.now() - startTime;
      
      // Step 5: Performance tracking
      this.performanceMonitor.recordLLMProcessing({
        jobId,
        emailId: emailData.id,
        processingType: this.config.enableTwoStageProcessing ? 'two_stage' : 'unified',
        duration,
        success: true,
        inputSize: this.calculateInputSize(emailData),
        outputSize: JSON.stringify(llmResult).length,
        confidence: llmResult.confidence || 0.5,
        cacheHit: llmResult.cacheHit || false
      });

      console.log(`✅ Email processed successfully: ${jobId} (${duration}ms)`);
      
      return {
        processed: true,
        jobId,
        llmResult,
        conflictResult,
        processingId,
        duration,
        metadata: {
          validationResult,
          recordSource: RECORD_SOURCES.LLM_PROCESSED
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record the error
      this.performanceMonitor.recordError('email_processing', error, {
        processingId,
        email_subject: emailData.subject,
        email_from: emailData.from
      });

      this.performanceMonitor.recordLLMProcessing({
        processingType: 'error',
        duration,
        success: false,
        error: error.message,
        inputSize: this.calculateInputSize(emailData)
      });

      console.error(`❌ Email processing failed (${processingId}):`, error);
      
      return {
        processed: false,
        error: error.message,
        processingId,
        duration
      };
    }
  }

  /**
   * Create manual record with validation and conflict detection
   */
  async createManualRecord(recordData, userId = 'default') {
    const startTime = Date.now();
    
    try {
      // Validate manual record data
      const validation = await this.sourceValidator.validateManualRecordCreation(recordData);
      
      if (validation.hasConflicts) {
        console.log(`⚠️ Manual record creation has conflicts:`, validation.conflictingRecords);
      }

      // Generate job ID
      const jobId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create the record
      const createStmt = this.db.prepare(`
        INSERT INTO job_applications (
          job_id, user_id, company, job_title, normalized_job_title,
          location, status, first_contact_date, last_contact_date,
          email_count, record_source, creation_method, data_quality,
          skip_llm_processing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      createStmt.run(
        jobId,
        userId,
        recordData.company,
        recordData.job_title,
        this.normalizeJobTitle(recordData.job_title),
        recordData.location,
        recordData.status,
        recordData.application_date || new Date().toISOString(),
        new Date().toISOString(),
        0, // No emails for manual records
        RECORD_SOURCES.MANUAL_CREATED,
        'manual_entry',
        DATA_QUALITY.MANUAL,
        1 // Skip LLM processing
      );

      // Create metadata
      await this.recordMetadata.createManualRecordMetadata(jobId, recordData);
      
      // Update validator index
      this.sourceValidator.updateManualRecordsIndex(jobId, recordData, 'upsert');
      
      // Record performance
      const duration = Date.now() - startTime;
      this.performanceMonitor.recordManualRecordCreation({
        jobId,
        conflictsDetected: validation.hasConflicts,
        duplicatesPrevented: false, // Could be enhanced
        validationTime: duration,
        success: true
      });

      console.log(`✅ Manual record created: ${jobId}`);
      
      return {
        jobId,
        validation,
        recordSource: RECORD_SOURCES.MANUAL_CREATED,
        duration
      };

    } catch (error) {
      this.performanceMonitor.recordError('manual_record_creation', error, recordData);
      console.error('❌ Manual record creation failed:', error);
      throw error;
    }
  }

  /**
   * Handle record editing with conflict resolution
   */
  async editRecord(jobId, updates, userId = 'default') {
    const startTime = Date.now();
    
    try {
      // Get current record
      const currentRecord = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(jobId);
      
      if (!currentRecord) {
        throw new Error(`Job record ${jobId} not found`);
      }

      // Handle the edit
      const editMetadata = await this.recordMetadata.handleUserEdit(jobId, updates, currentRecord);
      
      // Apply updates to database
      const updateFields = Object.keys(updates).map(field => `${field} = ?`).join(', ');
      const updateStmt = this.db.prepare(`
        UPDATE job_applications 
        SET ${updateFields}, updated_at = CURRENT_TIMESTAMP
        WHERE job_id = ?
      `);
      
      updateStmt.run(...Object.values(updates), jobId);
      
      // Update validator index if this is a manual record
      if (currentRecord.record_source === RECORD_SOURCES.MANUAL_CREATED) {
        this.sourceValidator.updateManualRecordsIndex(jobId, { ...currentRecord, ...updates }, 'upsert');
      }
      
      // Invalidate related caches
      const invalidatedKeys = this.cacheManager.invalidateJobCaches(jobId, updates);
      
      const duration = Date.now() - startTime;
      
      console.log(`✅ Record edited: ${jobId} (${Object.keys(updates).join(', ')})`);
      
      return {
        jobId,
        editMetadata,
        invalidatedKeys,
        duration,
        updatedFields: Object.keys(updates)
      };

    } catch (error) {
      this.performanceMonitor.recordError('record_edit', error, { jobId, updates });
      console.error(`❌ Record edit failed for ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Pre-processing validation
   */
  async preProcessValidation(emailData) {
    // Quick classification to check if email is job-related
    const quickClassification = await this.quickClassifyEmail(emailData);
    
    if (!quickClassification.is_job_related) {
      return {
        shouldProcess: false,
        reason: 'not_job_related',
        manualRecordRisk: 'none'
      };
    }

    // Check against manual records
    return await this.sourceValidator.shouldProcessEmail(emailData, quickClassification);
  }

  /**
   * Quick email classification for validation
   */
  async quickClassifyEmail(emailData) {
    const cacheKey = this.cacheManager.generateClassificationCacheKey(
      emailData.subject,
      emailData.content,
      emailData.from
    );

    // Check cache first
    const cached = this.cacheManager.getClassificationCache(
      emailData.subject,
      emailData.content,
      emailData.from
    );

    if (cached) {
      return { ...cached, cacheHit: true };
    }

    // Perform classification
    const result = await classifyEmail({
      subject: emailData.subject,
      plaintext: emailData.content,
      from: emailData.from,
      maxTokens: 32,
      temperature: 0.0
    });

    // Cache the result
    this.cacheManager.setClassificationCache(
      emailData.subject,
      emailData.content,
      emailData.from,
      result
    );

    return { ...result, cacheHit: false };
  }

  /**
   * Perform LLM processing with caching
   */
  async performLLMProcessing(emailData, options) {
    const cacheKey = this.cacheManager.generateParsingCacheKey(
      emailData.subject,
      emailData.content,
      emailData.from,
      emailData.headers
    );

    // Check cache first
    const cached = this.cacheManager.getParsingCache(
      emailData.subject,
      emailData.content,
      emailData.from,
      emailData.headers
    );

    if (cached) {
      return { ...cached, cacheHit: true };
    }

    // Perform LLM processing
    const processingFunction = this.config.enableTwoStageProcessing ? 
      parseEmailWithTwoStage : parseEmailWithLLM;

    const result = await processingFunction({
      subject: emailData.subject,
      plaintext: emailData.content,
      from: emailData.from,
      headers: emailData.headers,
      ...options
    });

    // Cache the result
    this.cacheManager.setParsingCache(
      emailData.subject,
      emailData.content,
      emailData.from,
      emailData.headers,
      result
    );

    return { ...result, cacheHit: false };
  }

  /**
   * Handle conflicts between LLM and manual data
   */
  async handleConflicts(llmResult, validationResult) {
    if (!this.config.enableConflictResolution) {
      return { hasConflicts: false };
    }

    // Check for conflicts with existing manual records
    if (validationResult.conflictingRecord) {
      const conflicts = await this.conflictResolver.resolveConflicts(
        validationResult.conflictingRecord.job_id,
        llmResult,
        validationResult.conflictingRecord
      );

      if (conflicts.hasConflicts) {
        this.performanceMonitor.recordConflictResolution({
          jobId: validationResult.conflictingRecord.job_id,
          conflictCount: conflicts.conflicts.length,
          resolvedCount: conflicts.resolutionResults?.length || 0,
          autoResolvedCount: conflicts.resolutionResults?.filter(r => 
            r.strategy !== RESOLUTION_STRATEGIES.FLAG_FOR_REVIEW
          ).length || 0,
          manualReviewCount: conflicts.resolutionResults?.filter(r => 
            r.strategy === RESOLUTION_STRATEGIES.FLAG_FOR_REVIEW
          ).length || 0,
          resolutionTime: 100 // Placeholder - would measure actual time
        });
      }

      return conflicts;
    }

    return { hasConflicts: false };
  }

  /**
   * Create or update job record with metadata
   */
  async createOrUpdateRecord(llmResult, conflictResult, emailData) {
    // Implementation depends on existing email matcher integration
    // This is a placeholder showing the metadata integration
    
    const recordData = conflictResult.hasConflicts ? 
      conflictResult.resolvedData : llmResult;

    // Use existing email matcher for actual record creation
    // but add metadata tracking
    const jobId = await this.integrateWithEmailMatcher(recordData, emailData);
    
    // Add LLM metadata
    await this.recordMetadata.createLLMProcessedMetadata(jobId, llmResult, {
      method: 'email_processing',
      type: this.config.enableTwoStageProcessing ? 'two_stage' : 'unified',
      modelVersion: process.env.ONLYJOBS_MODEL_NAME,
      promptVersion: process.env.ONLYJOBS_PROMPT_VERSION
    });

    return jobId;
  }

  /**
   * Integration with existing email matcher
   */
  async integrateWithEmailMatcher(recordData, emailData) {
    // This would integrate with the existing EmailMatcher class
    // For now, return a placeholder implementation
    return `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility functions
   */
  generateProcessingId() {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  calculateInputSize(emailData) {
    return (emailData.subject?.length || 0) + (emailData.content?.length || 0);
  }

  normalizeJobTitle(title) {
    if (!title) return null;
    return title
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\b(sr|jr|senior|junior|lead|principal|staff)\b/g, '')
      .replace(/\b(i{1,3}|iv|v|vi{1,3}|ix|x)\b/g, '')
      .replace(/\b\d+\b/g, '')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus() {
    return {
      config: this.config,
      performance: this.performanceMonitor.getPerformanceSummary(),
      cacheStats: this.cacheManager.getCacheStats(),
      validationStats: this.sourceValidator.getValidationStats(),
      conflictStats: this.conflictResolver.getResolutionStats(),
      manualRecordsCount: this.sourceValidator.manualRecordsIndex.size
    };
  }

  /**
   * Update processor configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Enhanced LLM Processor configuration updated:', newConfig);
  }

  /**
   * Refresh all cached data (manual records, etc.)
   */
  async refreshCachedData() {
    await this.sourceValidator.refreshManualRecordsIndex();
    this.cacheManager.clearAllCaches();
    console.log('🔄 Enhanced LLM Processor cached data refreshed');
  }
}

module.exports = EnhancedLLMProcessor;