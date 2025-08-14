/**
 * Conflict Resolution System for Manual vs LLM Data
 * Handles conflicts between user-edited records and LLM processing
 */

const { RecordMetadata, RECORD_SOURCES, DATA_QUALITY } = require('./recordMetadata');

/**
 * Conflict resolution strategies
 */
const RESOLUTION_STRATEGIES = {
  PREFER_MANUAL: 'prefer_manual',     // Always use manual data (default)
  PREFER_LLM: 'prefer_llm',          // Use LLM data if confidence is high
  MERGE: 'merge',                     // Intelligent merge of both sources
  FLAG_FOR_REVIEW: 'flag_for_review', // Mark for manual review
  HYBRID: 'hybrid'                    // Use best fields from each source
};

/**
 * Conflict types for classification
 */
const CONFLICT_TYPES = {
  DATA_MISMATCH: 'data_mismatch',           // Different values for same field
  STATUS_CONFLICT: 'status_conflict',       // Different status interpretations
  DUPLICATE_DETECTION: 'duplicate_detection', // Same job detected multiple ways
  TEMPORAL_CONFLICT: 'temporal_conflict',   // Timeline inconsistencies
  CONFIDENCE_CONFLICT: 'confidence_conflict' // High confidence LLM vs manual data
};

class ConflictResolver {
  constructor(db) {
    this.db = db;
    this.recordMetadata = new RecordMetadata(db);
    
    // Conflict resolution preferences (can be user-configured)
    this.resolutionPreferences = {
      company: RESOLUTION_STRATEGIES.PREFER_MANUAL,
      job_title: RESOLUTION_STRATEGIES.PREFER_MANUAL,
      location: RESOLUTION_STRATEGIES.MERGE,
      status: RESOLUTION_STRATEGIES.HYBRID,
      default: RESOLUTION_STRATEGIES.PREFER_MANUAL
    };

    // Confidence thresholds for resolution decisions
    this.confidenceThresholds = {
      high: 0.9,      // LLM data with this confidence can override manual in some cases
      medium: 0.7,    // Moderate confidence - use for merging
      low: 0.5        // Low confidence - prefer manual data
    };
  }

  /**
   * Resolve conflicts between manual and LLM data for a job record
   */
  async resolveConflicts(jobId, llmData, manualData = null) {
    try {
      // Get current record data if manual data not provided
      if (!manualData) {
        manualData = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(jobId);
      }

      if (!manualData) {
        throw new Error(`Job record ${jobId} not found`);
      }

      // Identify conflicts
      const conflicts = this.identifyConflicts(manualData, llmData);
      
      if (conflicts.length === 0) {
        return {
          hasConflicts: false,
          resolution: 'no_conflicts',
          resolvedData: manualData,
          conflicts: []
        };
      }

      // Resolve each conflict
      const resolutionResults = await this.resolveIndividualConflicts(conflicts, manualData, llmData);
      
      // Merge resolved data
      const resolvedData = this.mergeResolvedData(manualData, llmData, resolutionResults);

      // Log the resolution
      await this.logConflictResolution(jobId, conflicts, resolutionResults, resolvedData);

      return {
        hasConflicts: true,
        resolution: 'resolved',
        resolvedData,
        conflicts,
        resolutionResults,
        requiresReview: resolutionResults.some(r => r.strategy === RESOLUTION_STRATEGIES.FLAG_FOR_REVIEW)
      };

    } catch (error) {
      console.error('Error resolving conflicts:', error);
      return {
        hasConflicts: true,
        resolution: 'error',
        error: error.message,
        resolvedData: manualData // Fall back to manual data
      };
    }
  }

  /**
   * Identify specific conflicts between manual and LLM data
   */
  identifyConflicts(manualData, llmData) {
    const conflicts = [];
    const fieldsToCheck = ['company', 'job_title', 'location', 'status'];

    fieldsToCheck.forEach(field => {
      const manualValue = manualData[field];
      const llmValue = llmData[field];

      // Skip if both are null/empty
      if (!manualValue && !llmValue) return;

      // Skip if values are the same
      if (manualValue === llmValue) return;

      // Special handling for different field types
      const conflictInfo = this.analyzeFieldConflict(field, manualValue, llmValue, llmData);
      
      if (conflictInfo.hasConflict) {
        conflicts.push({
          field,
          conflictType: conflictInfo.type,
          manualValue,
          llmValue,
          confidence: llmData.confidence || 0.5,
          severity: conflictInfo.severity,
          metadata: conflictInfo.metadata
        });
      }
    });

    return conflicts;
  }

  /**
   * Analyze conflict for a specific field
   */
  analyzeFieldConflict(field, manualValue, llmValue, llmData) {
    const confidence = llmData.confidence || 0.5;
    
    switch (field) {
      case 'company':
        return this.analyzeCompanyConflict(manualValue, llmValue, confidence);
      
      case 'job_title':
        return this.analyzeJobTitleConflict(manualValue, llmValue, confidence);
      
      case 'status':
        return this.analyzeStatusConflict(manualValue, llmValue, confidence, llmData);
      
      case 'location':
        return this.analyzeLocationConflict(manualValue, llmValue, confidence);
      
      default:
        return {
          hasConflict: manualValue !== llmValue,
          type: CONFLICT_TYPES.DATA_MISMATCH,
          severity: 'medium',
          metadata: {}
        };
    }
  }

  /**
   * Analyze company name conflicts
   */
  analyzeCompanyConflict(manualValue, llmValue, confidence) {
    if (!manualValue || !llmValue) {
      return {
        hasConflict: true,
        type: CONFLICT_TYPES.DATA_MISMATCH,
        severity: 'low',
        metadata: { reason: 'missing_value' }
      };
    }

    // Normalize for comparison
    const normalizedManual = manualValue.toLowerCase().trim();
    const normalizedLLM = llmValue.toLowerCase().trim();

    // Check for common variations
    const similarity = this.calculateStringSimilarity(normalizedManual, normalizedLLM);
    
    if (similarity > 0.8) {
      return {
        hasConflict: false,
        type: null,
        severity: 'none',
        metadata: { similarity }
      };
    }

    return {
      hasConflict: true,
      type: CONFLICT_TYPES.DATA_MISMATCH,
      severity: confidence > this.confidenceThresholds.high ? 'high' : 'medium',
      metadata: { similarity }
    };
  }

  /**
   * Analyze job title conflicts
   */
  analyzeJobTitleConflict(manualValue, llmValue, confidence) {
    if (!manualValue || !llmValue) {
      return {
        hasConflict: true,
        type: CONFLICT_TYPES.DATA_MISMATCH,
        severity: 'low',
        metadata: { reason: 'missing_value' }
      };
    }

    // Normalize job titles for comparison
    const normalizedManual = this.normalizeJobTitle(manualValue);
    const normalizedLLM = this.normalizeJobTitle(llmValue);

    const similarity = this.calculateStringSimilarity(normalizedManual, normalizedLLM);
    
    if (similarity > 0.7) {
      return {
        hasConflict: false,
        type: null,
        severity: 'none',
        metadata: { similarity }
      };
    }

    return {
      hasConflict: true,
      type: CONFLICT_TYPES.DATA_MISMATCH,
      severity: 'medium',
      metadata: { similarity, normalizedManual, normalizedLLM }
    };
  }

  /**
   * Analyze status conflicts (critical for timeline accuracy)
   */
  analyzeStatusConflict(manualValue, llmValue, confidence, llmData) {
    if (!manualValue || !llmValue) {
      return {
        hasConflict: true,
        type: CONFLICT_TYPES.STATUS_CONFLICT,
        severity: 'low',
        metadata: { reason: 'missing_status' }
      };
    }

    // Define status progression order
    const statusOrder = ['Applied', 'Interview', 'Declined', 'Offer'];
    const manualIndex = statusOrder.indexOf(manualValue);
    const llmIndex = statusOrder.indexOf(llmValue);

    // Check for logical progression conflicts
    if (manualIndex > llmIndex && manualValue !== 'Declined') {
      return {
        hasConflict: true,
        type: CONFLICT_TYPES.TEMPORAL_CONFLICT,
        severity: 'high',
        metadata: { 
          reason: 'status_regression',
          manualIndex,
          llmIndex
        }
      };
    }

    // High confidence LLM status vs manual
    if (confidence > this.confidenceThresholds.high && manualValue !== llmValue) {
      return {
        hasConflict: true,
        type: CONFLICT_TYPES.CONFIDENCE_CONFLICT,
        severity: 'high',
        metadata: { confidence }
      };
    }

    return {
      hasConflict: true,
      type: CONFLICT_TYPES.STATUS_CONFLICT,
      severity: 'medium',
      metadata: { manualIndex, llmIndex }
    };
  }

  /**
   * Analyze location conflicts
   */
  analyzeLocationConflict(manualValue, llmValue, confidence) {
    if (!manualValue || !llmValue) {
      return {
        hasConflict: false, // Location conflicts are low priority
        type: null,
        severity: 'none',
        metadata: { reason: 'missing_location' }
      };
    }

    const similarity = this.calculateStringSimilarity(manualValue.toLowerCase(), llmValue.toLowerCase());
    
    return {
      hasConflict: similarity < 0.5,
      type: CONFLICT_TYPES.DATA_MISMATCH,
      severity: 'low',
      metadata: { similarity }
    };
  }

  /**
   * Resolve individual conflicts based on strategies
   */
  async resolveIndividualConflicts(conflicts, manualData, llmData) {
    const resolutions = [];

    for (const conflict of conflicts) {
      const strategy = this.selectResolutionStrategy(conflict);
      const resolution = this.applyResolutionStrategy(conflict, strategy, manualData, llmData);
      
      resolutions.push({
        field: conflict.field,
        conflict,
        strategy,
        resolution,
        rationale: this.generateResolutionRationale(conflict, strategy, resolution)
      });
    }

    return resolutions;
  }

  /**
   * Select appropriate resolution strategy for a conflict
   */
  selectResolutionStrategy(conflict) {
    const { field, severity, confidence, conflictType } = conflict;

    // High severity conflicts need review
    if (severity === 'high') {
      return RESOLUTION_STRATEGIES.FLAG_FOR_REVIEW;
    }

    // Use field-specific preferences
    const fieldPreference = this.resolutionPreferences[field] || this.resolutionPreferences.default;

    // Override based on confidence for certain cases
    if (confidence > this.confidenceThresholds.high && fieldPreference !== RESOLUTION_STRATEGIES.PREFER_MANUAL) {
      return RESOLUTION_STRATEGIES.HYBRID;
    }

    // Status conflicts use special logic
    if (field === 'status' && conflictType === CONFLICT_TYPES.TEMPORAL_CONFLICT) {
      return RESOLUTION_STRATEGIES.PREFER_MANUAL; // Users know their application timeline
    }

    return fieldPreference;
  }

  /**
   * Apply the selected resolution strategy
   */
  applyResolutionStrategy(conflict, strategy, manualData, llmData) {
    const { field, manualValue, llmValue } = conflict;

    switch (strategy) {
      case RESOLUTION_STRATEGIES.PREFER_MANUAL:
        return { value: manualValue, source: 'manual' };

      case RESOLUTION_STRATEGIES.PREFER_LLM:
        return { value: llmValue, source: 'llm' };

      case RESOLUTION_STRATEGIES.MERGE:
        return this.mergeValues(field, manualValue, llmValue);

      case RESOLUTION_STRATEGIES.HYBRID:
        return this.hybridResolution(conflict, manualData, llmData);

      case RESOLUTION_STRATEGIES.FLAG_FOR_REVIEW:
        return { 
          value: manualValue, // Keep manual until reviewed
          source: 'manual',
          requiresReview: true
        };

      default:
        return { value: manualValue, source: 'manual' };
    }
  }

  /**
   * Merge values intelligently
   */
  mergeValues(field, manualValue, llmValue) {
    if (!manualValue) return { value: llmValue, source: 'llm' };
    if (!llmValue) return { value: manualValue, source: 'manual' };

    switch (field) {
      case 'location':
        // Prefer more specific location data
        return manualValue.length > llmValue.length ? 
          { value: manualValue, source: 'manual' } : 
          { value: llmValue, source: 'llm' };

      case 'company':
        // Prefer more complete company name
        return manualValue.length > llmValue.length ? 
          { value: manualValue, source: 'manual' } : 
          { value: llmValue, source: 'llm' };

      default:
        return { value: manualValue, source: 'manual' };
    }
  }

  /**
   * Hybrid resolution using best of both sources
   */
  hybridResolution(conflict, manualData, llmData) {
    const { field, confidence } = conflict;

    // For high-confidence LLM data, prefer LLM
    if (confidence > this.confidenceThresholds.high) {
      return { value: conflict.llmValue, source: 'llm_high_confidence' };
    }

    // For medium confidence, consider field type
    if (confidence > this.confidenceThresholds.medium) {
      if (field === 'status' && this.isStatusProgression(manualData.status, conflict.llmValue)) {
        return { value: conflict.llmValue, source: 'llm_progression' };
      }
    }

    // Default to manual
    return { value: conflict.manualValue, source: 'manual_default' };
  }

  /**
   * Check if status change represents logical progression
   */
  isStatusProgression(currentStatus, newStatus) {
    const progressions = {
      'Applied': ['Interview', 'Declined', 'Offer'],
      'Interview': ['Declined', 'Offer'],
      'Declined': [], // Terminal status
      'Offer': []     // Terminal status
    };

    return progressions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * Merge resolved data back into record
   */
  mergeResolvedData(manualData, llmData, resolutionResults) {
    const resolvedData = { ...manualData };

    resolutionResults.forEach(result => {
      const { field, resolution } = result;
      resolvedData[field] = resolution.value;
      
      // Track resolution metadata
      if (!resolvedData.resolution_metadata) {
        resolvedData.resolution_metadata = {};
      }
      resolvedData.resolution_metadata[field] = {
        source: resolution.source,
        strategy: result.strategy,
        timestamp: new Date().toISOString(),
        requiresReview: resolution.requiresReview || false
      };
    });

    return resolvedData;
  }

  /**
   * Generate human-readable rationale for resolution
   */
  generateResolutionRationale(conflict, strategy, resolution) {
    const { field, severity, confidence } = conflict;

    switch (strategy) {
      case RESOLUTION_STRATEGIES.PREFER_MANUAL:
        return `Kept manual ${field} value to preserve user intent`;

      case RESOLUTION_STRATEGIES.PREFER_LLM:
        return `Used LLM ${field} value due to high confidence (${confidence})`;

      case RESOLUTION_STRATEGIES.HYBRID:
        return `Selected best ${field} value based on confidence and context`;

      case RESOLUTION_STRATEGIES.MERGE:
        return `Merged manual and LLM ${field} data for completeness`;

      case RESOLUTION_STRATEGIES.FLAG_FOR_REVIEW:
        return `${field} conflict requires manual review due to ${severity} severity`;

      default:
        return `Applied default resolution for ${field}`;
    }
  }

  /**
   * Log conflict resolution for audit trail
   */
  async logConflictResolution(jobId, conflicts, resolutionResults, resolvedData) {
    const logEntry = {
      job_id: jobId,
      conflict_count: conflicts.length,
      conflicts: conflicts.map(c => ({
        field: c.field,
        type: c.conflictType,
        severity: c.severity
      })),
      resolutions: resolutionResults.map(r => ({
        field: r.field,
        strategy: r.strategy,
        source: r.resolution.source
      })),
      requires_review: resolutionResults.some(r => r.resolution.requiresReview),
      timestamp: new Date().toISOString()
    };

    // Store in database
    const stmt = this.db.prepare(`
      INSERT INTO manual_record_conflicts 
      (job_id, conflict_type, manual_data, llm_data, resolution_strategy, resolved)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      jobId,
      'automated_resolution',
      JSON.stringify({ original_conflicts: conflicts }),
      JSON.stringify({ resolution_log: logEntry }),
      'automated_hybrid',
      logEntry.requires_review ? 0 : 1
    );
  }

  /**
   * Calculate string similarity using Jaccard index
   */
  calculateStringSimilarity(str1, str2) {
    const set1 = new Set(str1.toLowerCase().split(/\s+/));
    const set2 = new Set(str2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Normalize job title for comparison
   */
  normalizeJobTitle(title) {
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
   * Update resolution preferences
   */
  updateResolutionPreferences(newPreferences) {
    this.resolutionPreferences = { ...this.resolutionPreferences, ...newPreferences };
  }

  /**
   * Get conflict resolution statistics
   */
  getResolutionStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_conflicts,
        SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved_conflicts,
        COUNT(DISTINCT job_id) as affected_jobs
      FROM manual_record_conflicts
      WHERE created_at > datetime('now', '-30 days')
    `).get();

    return {
      ...stats,
      resolution_rate: stats.total_conflicts > 0 ? 
        (stats.resolved_conflicts / stats.total_conflicts * 100).toFixed(2) + '%' : '0%'
    };
  }
}

module.exports = {
  ConflictResolver,
  RESOLUTION_STRATEGIES,
  CONFLICT_TYPES
};