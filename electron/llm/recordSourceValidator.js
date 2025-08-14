/**
 * Record Source Validation System
 * Prevents LLM processing of manual records and manages source conflicts
 */

const { RecordMetadata, RECORD_SOURCES, DATA_QUALITY } = require('./recordMetadata');
const EnhancedCacheManager = require('./enhancedCacheManager');

class RecordSourceValidator {
  constructor(db) {
    this.db = db;
    this.recordMetadata = new RecordMetadata(db);
    this.cacheManager = new EnhancedCacheManager();
    this.manualRecordsIndex = new Map(); // In-memory index of manual records
    this.loadManualRecordsIndex();
  }

  /**
   * Load manual records into memory for fast validation
   */
  loadManualRecordsIndex() {
    const manualRecords = this.recordMetadata.getManualRecords();
    this.manualRecordsIndex.clear();

    manualRecords.forEach(record => {
      const key = this.generateRecordKey(record.company, record.job_title, record.normalized_job_title);
      this.manualRecordsIndex.set(key, record);
    });

    console.log(`Loaded ${manualRecords.length} manual records into validation index`);
  }

  /**
   * Generate a key for record matching
   */
  generateRecordKey(company, jobTitle, normalizedTitle) {
    const normalizedCompany = (company || '').toLowerCase().trim();
    const normalizedJob = (normalizedTitle || jobTitle || '').toLowerCase().trim();
    return `${normalizedCompany}:${normalizedJob}`;
  }

  /**
   * Check if an email should be processed by LLM
   */
  async shouldProcessEmail(emailData, preliminaryClassification) {
    try {
      // Quick check: if email is not job-related, no need for further validation
      if (!preliminaryClassification.is_job_related) {
        return {
          shouldProcess: false,
          reason: 'not_job_related',
          manualRecordRisk: 'none'
        };
      }

      // Extract potential company and job title from email
      const potentialCompany = this.extractCompanyFromEmail(emailData);
      const potentialJobTitle = this.extractJobTitleFromEmail(emailData);

      // Check against manual records index
      const manualRecordMatch = this.findManualRecordMatch(potentialCompany, potentialJobTitle);
      
      if (manualRecordMatch) {
        console.log(`🚫 Blocking LLM processing: manual record found for ${potentialCompany} - ${potentialJobTitle}`);
        return {
          shouldProcess: false,
          reason: 'manual_record_exists',
          manualRecordRisk: 'high',
          conflictingRecord: manualRecordMatch,
          extractedData: { company: potentialCompany, jobTitle: potentialJobTitle }
        };
      }

      // Check manual record risk from preliminary classification
      const riskLevel = preliminaryClassification.manual_record_risk || 'low';
      
      if (riskLevel === 'high') {
        // For high-risk emails, do additional duplicate checking
        const duplicateCheck = await this.performDuplicateCheck(emailData, potentialCompany, potentialJobTitle);
        
        if (duplicateCheck.hasDuplicates) {
          return {
            shouldProcess: false,
            reason: 'potential_duplicate',
            manualRecordRisk: riskLevel,
            duplicateInfo: duplicateCheck
          };
        }
      }

      // Email can be processed
      return {
        shouldProcess: true,
        reason: 'validation_passed',
        manualRecordRisk: riskLevel,
        extractedData: { company: potentialCompany, jobTitle: potentialJobTitle }
      };

    } catch (error) {
      console.error('Error in record source validation:', error);
      // On error, allow processing but log the issue
      return {
        shouldProcess: true,
        reason: 'validation_error',
        manualRecordRisk: 'unknown',
        error: error.message
      };
    }
  }

  /**
   * Find manual record that matches the email data
   */
  findManualRecordMatch(company, jobTitle) {
    if (!company && !jobTitle) return null;

    // Try exact match first
    const exactKey = this.generateRecordKey(company, jobTitle, jobTitle);
    let match = this.manualRecordsIndex.get(exactKey);
    if (match) return match;

    // Try fuzzy matching
    for (const [key, record] of this.manualRecordsIndex.entries()) {
      if (this.isRecordMatch(company, jobTitle, record)) {
        return record;
      }
    }

    return null;
  }

  /**
   * Check if email data matches a manual record
   */
  isRecordMatch(emailCompany, emailJobTitle, manualRecord) {
    const companyMatch = this.compareCompanyNames(emailCompany, manualRecord.company);
    const titleMatch = this.compareJobTitles(emailJobTitle, manualRecord.job_title, manualRecord.normalized_job_title);
    
    // Both company and title must have some similarity
    return companyMatch > 0.7 && titleMatch > 0.6;
  }

  /**
   * Compare company names with fuzzy matching
   */
  compareCompanyNames(company1, company2) {
    if (!company1 || !company2) return 0;

    const norm1 = company1.toLowerCase().trim();
    const norm2 = company2.toLowerCase().trim();

    // Exact match
    if (norm1 === norm2) return 1.0;

    // Check if one contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;

    // Simple token-based similarity
    const tokens1 = new Set(norm1.split(/\s+/));
    const tokens2 = new Set(norm2.split(/\s+/));
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Compare job titles with normalization
   */
  compareJobTitles(title1, title2, normalizedTitle2) {
    if (!title1 || !title2) return 0;

    const norm1 = this.normalizeJobTitle(title1);
    const norm2 = normalizedTitle2 || this.normalizeJobTitle(title2);

    // Exact match after normalization
    if (norm1 === norm2) return 1.0;

    // Token-based similarity
    const tokens1 = new Set(norm1.split(/\s+/));
    const tokens2 = new Set(norm2.split(/\s+/));
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Normalize job title for comparison
   */
  normalizeJobTitle(title) {
    if (!title) return '';

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
   * Extract company name from email data
   */
  extractCompanyFromEmail(emailData) {
    const { subject, content, from } = emailData;

    // Try to extract from subject
    const subjectPatterns = [
      /^(.+?)\s*-\s*Job Application/i,
      /^(.+?)\s*:\s*Application/i,
      /Application at\s+(.+?)$/i,
      /Thank you for applying to\s+(.+?)$/i
    ];

    for (const pattern of subjectPatterns) {
      const match = subject.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Try to extract from sender domain
    if (from) {
      const domainMatch = from.match(/@([^.]+)\./);
      if (domainMatch) {
        const domain = domainMatch[1];
        const excludeDomains = ['gmail', 'yahoo', 'outlook', 'hotmail', 'mail', 'noreply', 'careers', 'jobs'];
        if (!excludeDomains.includes(domain.toLowerCase())) {
          return domain.charAt(0).toUpperCase() + domain.slice(1);
        }
      }
    }

    // Try to extract from content patterns
    const contentPatterns = [
      /at\s+([A-Z][A-Za-z\s&,.-]+?)\s*(?:\.|,|\n|for|has|is)/g,
      /with\s+([A-Z][A-Za-z\s&,.-]+?)\s*(?:\.|,|\n|for|has|is)/g,
      /([A-Z][A-Za-z\s&,.-]+?)\s+(?:has|is|team|hiring|position)/g
    ];

    for (const pattern of contentPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const candidate = match[1]?.trim();
        if (candidate && candidate.length > 2 && candidate.length < 50) {
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Extract job title from email data
   */
  extractJobTitleFromEmail(emailData) {
    const { subject, content } = emailData;

    // Try to extract from subject
    const subjectPatterns = [
      /Application for\s+(.+?)$/i,
      /Your application for\s+(.+?)$/i,
      /(.+?)\s*-\s*Application/i,
      /Position:\s*(.+?)$/i,
      /Role:\s*(.+?)$/i
    ];

    for (const pattern of subjectPatterns) {
      const match = subject.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Try to extract from content
    const contentPatterns = [
      /application for\s+(?:the\s+)?(.+?)\s+(?:position|role|job)/i,
      /applied to\s+(?:the\s+)?(.+?)\s+(?:position|role|job)/i,
      /(.+?)\s+position\s+at/i,
      /role:\s*(.+?)$/im
    ];

    for (const pattern of contentPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Perform duplicate check for high-risk emails
   */
  async performDuplicateCheck(emailData, company, jobTitle) {
    const cacheKey = `${company}_${jobTitle}_${emailData.subject}`;
    const cached = this.cacheManager.getDuplicateCache(company, jobTitle, emailData.content);
    
    if (cached) {
      return cached;
    }

    // Check for existing records with similar data
    const existingRecords = this.db.prepare(`
      SELECT job_id, company, job_title, record_source 
      FROM job_applications 
      WHERE (company LIKE ? OR company LIKE ?) 
      AND (job_title LIKE ? OR normalized_job_title LIKE ?)
      AND created_at > datetime('now', '-30 days')
    `).all(
      `%${company}%`,
      `%${company.split(' ')[0]}%`,
      `%${jobTitle}%`,
      `%${this.normalizeJobTitle(jobTitle)}%`
    );

    const duplicateInfo = {
      hasDuplicates: existingRecords.length > 0,
      duplicateCount: existingRecords.length,
      duplicateRecords: existingRecords,
      hasManualDuplicates: existingRecords.some(r => 
        r.record_source === RECORD_SOURCES.MANUAL_CREATED || 
        r.record_source === RECORD_SOURCES.USER_EDITED
      )
    };

    this.cacheManager.setDuplicateCache(company, jobTitle, emailData.content, duplicateInfo);
    return duplicateInfo;
  }

  /**
   * Validate a manual record creation request
   */
  validateManualRecordCreation(recordData) {
    const { company, job_title } = recordData;
    
    // Check if this would conflict with existing LLM records
    const existingLLMRecords = this.db.prepare(`
      SELECT job_id, company, job_title, llm_confidence 
      FROM job_applications 
      WHERE record_source = ? 
      AND (company LIKE ? OR job_title LIKE ?)
      AND created_at > datetime('now', '-90 days')
    `).all(
      RECORD_SOURCES.LLM_PROCESSED,
      `%${company}%`,
      `%${job_title}%`
    );

    const conflicts = existingLLMRecords.filter(record => 
      this.compareCompanyNames(company, record.company) > 0.7 &&
      this.compareJobTitles(job_title, record.job_title) > 0.6
    );

    return {
      isValid: true, // Always allow manual creation
      hasConflicts: conflicts.length > 0,
      conflictingRecords: conflicts,
      recommendation: conflicts.length > 0 ? 'review_conflicts' : 'proceed'
    };
  }

  /**
   * Update manual records index when records change
   */
  updateManualRecordsIndex(jobId, recordData, action = 'upsert') {
    if (action === 'delete') {
      // Remove from index
      for (const [key, record] of this.manualRecordsIndex.entries()) {
        if (record.job_id === jobId) {
          this.manualRecordsIndex.delete(key);
          break;
        }
      }
    } else {
      // Add or update in index
      const key = this.generateRecordKey(recordData.company, recordData.job_title, recordData.normalized_job_title);
      this.manualRecordsIndex.set(key, { job_id: jobId, ...recordData });
    }

    // Invalidate related caches
    this.cacheManager.invalidateJobCaches(jobId, recordData);
  }

  /**
   * Get validation statistics
   */
  getValidationStats() {
    return {
      manualRecordsCount: this.manualRecordsIndex.size,
      cacheStats: this.cacheManager.getCacheStats(),
      validationCounts: {
        blocked: this.blockedCount || 0,
        allowed: this.allowedCount || 0,
        errors: this.errorCount || 0
      }
    };
  }

  /**
   * Refresh the manual records index
   */
  refreshManualRecordsIndex() {
    this.loadManualRecordsIndex();
    this.cacheManager.clearAllCaches();
  }
}

module.exports = RecordSourceValidator;