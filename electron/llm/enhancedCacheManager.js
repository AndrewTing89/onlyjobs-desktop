/**
 * Enhanced Cache Manager for Mixed Record Sources
 * Handles separate caching strategies for LLM-processed and manual records
 */

const crypto = require('crypto');
const { RECORD_SOURCES, DATA_QUALITY } = require('./recordMetadata');

class EnhancedCacheManager {
  constructor() {
    // Separate caches for different record types and processing stages
    this.emailClassificationCache = new Map(); // Fast classification cache
    this.emailParsingCache = new Map();        // Detailed parsing cache
    this.manualRecordCache = new Map();        // Manual record lookup cache
    this.conflictDetectionCache = new Map();   // Conflict detection cache
    this.duplicateCheckCache = new Map();      // Duplicate detection cache
    
    // Cache metadata for debugging and performance monitoring
    this.cacheStats = {
      emailClassification: { hits: 0, misses: 0, size: 0 },
      emailParsing: { hits: 0, misses: 0, size: 0 },
      manualRecord: { hits: 0, misses: 0, size: 0 },
      conflictDetection: { hits: 0, misses: 0, size: 0 },
      duplicateCheck: { hits: 0, misses: 0, size: 0 }
    };

    // Cache size limits
    this.maxCacheSize = {
      emailClassification: 1000,
      emailParsing: 500,
      manualRecord: 200,
      conflictDetection: 100,
      duplicateCheck: 300
    };

    // Cache TTL (time to live) in milliseconds
    this.cacheTTL = {
      emailClassification: 24 * 60 * 60 * 1000, // 24 hours
      emailParsing: 12 * 60 * 60 * 1000,        // 12 hours
      manualRecord: 60 * 60 * 1000,             // 1 hour (manual data changes frequently)
      conflictDetection: 30 * 60 * 1000,        // 30 minutes
      duplicateCheck: 6 * 60 * 60 * 1000        // 6 hours
    };
  }

  /**
   * Generate cache key for email classification
   */
  generateClassificationCacheKey(subject, plaintext, from) {
    const content = `${from || ''}\n${subject}\n${plaintext.slice(0, 500)}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Generate cache key for email parsing
   */
  generateParsingCacheKey(subject, plaintext, from, headers) {
    const content = `${from || ''}\n${JSON.stringify(headers || {})}\n${subject}\n${plaintext.slice(0, 2000)}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Generate cache key for manual record lookups
   */
  generateManualRecordCacheKey(company, jobTitle, normalizedTitle) {
    const content = `${company || ''}\n${jobTitle || ''}\n${normalizedTitle || ''}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Generate cache key for conflict detection
   */
  generateConflictCacheKey(jobId, llmData) {
    const content = `${jobId}\n${JSON.stringify(llmData)}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Generate cache key for duplicate checking
   */
  generateDuplicateCacheKey(company, jobTitle, emailContent) {
    const content = `${company || ''}\n${jobTitle || ''}\n${emailContent.slice(0, 1000)}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get cached email classification result
   */
  getClassificationCache(subject, plaintext, from) {
    const key = this.generateClassificationCacheKey(subject, plaintext, from);
    const cached = this.emailClassificationCache.get(key);
    
    if (cached && this.isValidCacheEntry(cached, this.cacheTTL.emailClassification)) {
      this.cacheStats.emailClassification.hits++;
      return cached.data;
    }
    
    if (cached) {
      this.emailClassificationCache.delete(key);
    }
    
    this.cacheStats.emailClassification.misses++;
    return null;
  }

  /**
   * Set cached email classification result
   */
  setClassificationCache(subject, plaintext, from, result) {
    const key = this.generateClassificationCacheKey(subject, plaintext, from);
    
    this.emailClassificationCache.set(key, {
      data: result,
      timestamp: Date.now(),
      key
    });

    this.enforceCacheLimit('emailClassification');
    this.updateCacheStats('emailClassification');
  }

  /**
   * Get cached email parsing result
   */
  getParsingCache(subject, plaintext, from, headers) {
    const key = this.generateParsingCacheKey(subject, plaintext, from, headers);
    const cached = this.emailParsingCache.get(key);
    
    if (cached && this.isValidCacheEntry(cached, this.cacheTTL.emailParsing)) {
      this.cacheStats.emailParsing.hits++;
      return cached.data;
    }
    
    if (cached) {
      this.emailParsingCache.delete(key);
    }
    
    this.cacheStats.emailParsing.misses++;
    return null;
  }

  /**
   * Set cached email parsing result
   */
  setParsingCache(subject, plaintext, from, headers, result) {
    const key = this.generateParsingCacheKey(subject, plaintext, from, headers);
    
    this.emailParsingCache.set(key, {
      data: result,
      timestamp: Date.now(),
      key
    });

    this.enforceCacheLimit('emailParsing');
    this.updateCacheStats('emailParsing');
  }

  /**
   * Get cached manual record lookup
   */
  getManualRecordCache(company, jobTitle, normalizedTitle) {
    const key = this.generateManualRecordCacheKey(company, jobTitle, normalizedTitle);
    const cached = this.manualRecordCache.get(key);
    
    if (cached && this.isValidCacheEntry(cached, this.cacheTTL.manualRecord)) {
      this.cacheStats.manualRecord.hits++;
      return cached.data;
    }
    
    if (cached) {
      this.manualRecordCache.delete(key);
    }
    
    this.cacheStats.manualRecord.misses++;
    return null;
  }

  /**
   * Set cached manual record lookup
   */
  setManualRecordCache(company, jobTitle, normalizedTitle, records) {
    const key = this.generateManualRecordCacheKey(company, jobTitle, normalizedTitle);
    
    this.manualRecordCache.set(key, {
      data: records,
      timestamp: Date.now(),
      key
    });

    this.enforceCacheLimit('manualRecord');
    this.updateCacheStats('manualRecord');
  }

  /**
   * Get cached conflict detection result
   */
  getConflictCache(jobId, llmData) {
    const key = this.generateConflictCacheKey(jobId, llmData);
    const cached = this.conflictDetectionCache.get(key);
    
    if (cached && this.isValidCacheEntry(cached, this.cacheTTL.conflictDetection)) {
      this.cacheStats.conflictDetection.hits++;
      return cached.data;
    }
    
    if (cached) {
      this.conflictDetectionCache.delete(key);
    }
    
    this.cacheStats.conflictDetection.misses++;
    return null;
  }

  /**
   * Set cached conflict detection result
   */
  setConflictCache(jobId, llmData, conflicts) {
    const key = this.generateConflictCacheKey(jobId, llmData);
    
    this.conflictDetectionCache.set(key, {
      data: conflicts,
      timestamp: Date.now(),
      key
    });

    this.enforceCacheLimit('conflictDetection');
    this.updateCacheStats('conflictDetection');
  }

  /**
   * Get cached duplicate check result
   */
  getDuplicateCache(company, jobTitle, emailContent) {
    const key = this.generateDuplicateCacheKey(company, jobTitle, emailContent);
    const cached = this.duplicateCheckCache.get(key);
    
    if (cached && this.isValidCacheEntry(cached, this.cacheTTL.duplicateCheck)) {
      this.cacheStats.duplicateCheck.hits++;
      return cached.data;
    }
    
    if (cached) {
      this.duplicateCheckCache.delete(key);
    }
    
    this.cacheStats.duplicateCheck.misses++;
    return null;
  }

  /**
   * Set cached duplicate check result
   */
  setDuplicateCache(company, jobTitle, emailContent, duplicates) {
    const key = this.generateDuplicateCacheKey(company, jobTitle, emailContent);
    
    this.duplicateCheckCache.set(key, {
      data: duplicates,
      timestamp: Date.now(),
      key
    });

    this.enforceCacheLimit('duplicateCheck');
    this.updateCacheStats('duplicateCheck');
  }

  /**
   * Invalidate caches related to a specific job record
   */
  invalidateJobCaches(jobId, affectedFields = {}) {
    const invalidatedKeys = [];

    // Invalidate manual record cache if company or job title changed
    if (affectedFields.company || affectedFields.job_title) {
      this.manualRecordCache.clear(); // Simple approach - clear all manual record cache
      invalidatedKeys.push('all_manual_records');
    }

    // Invalidate conflict detection cache for this job
    for (const [key, entry] of this.conflictDetectionCache.entries()) {
      if (key.includes(jobId)) {
        this.conflictDetectionCache.delete(key);
        invalidatedKeys.push(key);
      }
    }

    // Invalidate duplicate check cache if relevant fields changed
    if (affectedFields.company || affectedFields.job_title) {
      for (const [key, entry] of this.duplicateCheckCache.entries()) {
        if (entry.data && (
          entry.data.company === affectedFields.company ||
          entry.data.job_title === affectedFields.job_title
        )) {
          this.duplicateCheckCache.delete(key);
          invalidatedKeys.push(key);
        }
      }
    }

    return invalidatedKeys;
  }

  /**
   * Invalidate email-related caches when email processing changes
   */
  invalidateEmailCaches(emailContent, reason = 'email_update') {
    const invalidatedKeys = [];
    const emailHash = crypto.createHash('sha256').update(emailContent).digest('hex').slice(0, 16);

    // Find and invalidate related email caches
    for (const [key, entry] of this.emailClassificationCache.entries()) {
      if (key.includes(emailHash.slice(0, 8))) { // Partial match for efficiency
        this.emailClassificationCache.delete(key);
        invalidatedKeys.push(`classification_${key}`);
      }
    }

    for (const [key, entry] of this.emailParsingCache.entries()) {
      if (key.includes(emailHash.slice(0, 8))) {
        this.emailParsingCache.delete(key);
        invalidatedKeys.push(`parsing_${key}`);
      }
    }

    return invalidatedKeys;
  }

  /**
   * Check if cache entry is still valid
   */
  isValidCacheEntry(entry, ttl) {
    return (Date.now() - entry.timestamp) < ttl;
  }

  /**
   * Enforce cache size limits using LRU eviction
   */
  enforceCacheLimit(cacheType) {
    const cache = this.getCacheByType(cacheType);
    const limit = this.maxCacheSize[cacheType];

    if (cache.size > limit) {
      // Convert to array, sort by timestamp, and remove oldest entries
      const entries = Array.from(cache.entries());
      entries.sort(([,a], [,b]) => a.timestamp - b.timestamp);
      
      const toRemove = entries.slice(0, cache.size - limit);
      toRemove.forEach(([key]) => cache.delete(key));
    }
  }

  /**
   * Update cache statistics
   */
  updateCacheStats(cacheType) {
    const cache = this.getCacheByType(cacheType);
    this.cacheStats[cacheType].size = cache.size;
  }

  /**
   * Get cache object by type
   */
  getCacheByType(cacheType) {
    switch (cacheType) {
      case 'emailClassification': return this.emailClassificationCache;
      case 'emailParsing': return this.emailParsingCache;
      case 'manualRecord': return this.manualRecordCache;
      case 'conflictDetection': return this.conflictDetectionCache;
      case 'duplicateCheck': return this.duplicateCheckCache;
      default: throw new Error(`Unknown cache type: ${cacheType}`);
    }
  }

  /**
   * Clear all caches (for testing or manual reset)
   */
  clearAllCaches() {
    this.emailClassificationCache.clear();
    this.emailParsingCache.clear();
    this.manualRecordCache.clear();
    this.conflictDetectionCache.clear();
    this.duplicateCheckCache.clear();

    // Reset stats
    Object.keys(this.cacheStats).forEach(type => {
      this.cacheStats[type] = { hits: 0, misses: 0, size: 0 };
    });

    return 'All caches cleared';
  }

  /**
   * Get cache performance statistics
   */
  getCacheStats() {
    return {
      ...this.cacheStats,
      totalEntries: Object.values(this.cacheStats).reduce((sum, stats) => sum + stats.size, 0),
      totalHits: Object.values(this.cacheStats).reduce((sum, stats) => sum + stats.hits, 0),
      totalMisses: Object.values(this.cacheStats).reduce((sum, stats) => sum + stats.misses, 0),
      overallHitRate: this.calculateOverallHitRate()
    };
  }

  /**
   * Calculate overall cache hit rate
   */
  calculateOverallHitRate() {
    const totalHits = Object.values(this.cacheStats).reduce((sum, stats) => sum + stats.hits, 0);
    const totalRequests = Object.values(this.cacheStats).reduce((sum, stats) => sum + stats.hits + stats.misses, 0);
    
    return totalRequests > 0 ? (totalHits / totalRequests * 100).toFixed(2) + '%' : '0%';
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupExpiredEntries() {
    const now = Date.now();
    let cleanedCount = 0;

    Object.keys(this.cacheTTL).forEach(cacheType => {
      const cache = this.getCacheByType(cacheType);
      const ttl = this.cacheTTL[cacheType];

      for (const [key, entry] of cache.entries()) {
        if (!this.isValidCacheEntry(entry, ttl)) {
          cache.delete(key);
          cleanedCount++;
        }
      }

      this.updateCacheStats(cacheType);
    });

    return cleanedCount;
  }

  /**
   * Schedule periodic cache cleanup
   */
  startPeriodicCleanup(intervalMinutes = 30) {
    return setInterval(() => {
      const cleanedCount = this.cleanupExpiredEntries();
      console.log(`Cache cleanup: removed ${cleanedCount} expired entries`);
    }, intervalMinutes * 60 * 1000);
  }
}

module.exports = EnhancedCacheManager;