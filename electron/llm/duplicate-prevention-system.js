/**
 * Duplicate Prevention System
 * Advanced duplicate detection and prevention for mixed manual/automatic records
 */

const { RECORD_SOURCES } = require('./metadata-schema');

class DuplicatePreventionSystem {
  constructor(database, llmEngine) {
    this.db = database;
    this.llmEngine = llmEngine;
    this.similarityThreshold = 0.85;
    this.fuzzyMatchThreshold = 0.75;
  }

  /**
   * Comprehensive duplicate detection before creating new records
   */
  async detectDuplicatesBeforeCreation(newRecordData, userId = 'default') {
    const { company, position, fromAddress, emailContent } = newRecordData;
    
    // Multi-layered duplicate detection
    const detectionResults = await Promise.all([
      this.exactMatchDetection(company, position, userId),
      this.fuzzyMatchDetection(company, position, userId),
      this.domainBasedDetection(fromAddress, userId),
      this.contentBasedDetection(emailContent, company, position, userId),
      this.temporalPatternDetection(company, position, userId)
    ]);

    const [exactMatches, fuzzyMatches, domainMatches, contentMatches, temporalMatches] = detectionResults;

    return {
      hasExactDuplicates: exactMatches.length > 0,
      hasFuzzyDuplicates: fuzzyMatches.length > 0,
      hasDomainConflicts: domainMatches.length > 0,
      hasContentSimilarity: contentMatches.length > 0,
      hasTemporalPatterns: temporalMatches.length > 0,
      matches: {
        exact: exactMatches,
        fuzzy: fuzzyMatches,
        domain: domainMatches,
        content: contentMatches,
        temporal: temporalMatches
      },
      riskAssessment: this.assessOverallDuplicateRisk(detectionResults),
      recommendation: this.generateRecommendation(detectionResults)
    };
  }

  /**
   * Exact match detection (high confidence duplicates)
   */
  async exactMatchDetection(company, position, userId) {
    if (!company || !position) return [];

    const exactMatches = this.db.prepare(`
      SELECT job_id, company, job_title, record_source, created_at, status,
             'exact' as match_type, 1.0 as confidence_score
      FROM job_applications 
      WHERE user_id = ?
      AND LOWER(TRIM(company)) = LOWER(TRIM(?))
      AND LOWER(TRIM(job_title)) = LOWER(TRIM(?))
      AND created_at > datetime('now', '-90 days')
      ORDER BY created_at DESC
    `).all(userId, company, position);

    return exactMatches.map(match => ({
      ...match,
      prevention_action: 'block_creation',
      merge_candidate: true
    }));
  }

  /**
   * Fuzzy match detection (similar but not identical)
   */
  async fuzzyMatchDetection(company, position, userId) {
    if (!company || !position) return [];

    // Get all recent records for similarity comparison
    const recentRecords = this.db.prepare(`
      SELECT job_id, company, job_title, record_source, created_at, status
      FROM job_applications 
      WHERE user_id = ?
      AND created_at > datetime('now', '-180 days')
      ORDER BY created_at DESC
    `).all(userId);

    const fuzzyMatches = [];

    for (const record of recentRecords) {
      const companySimilarity = this.calculateAdvancedSimilarity(company, record.company);
      const positionSimilarity = this.calculateAdvancedSimilarity(position, record.job_title);
      
      const overallSimilarity = (companySimilarity * 0.6) + (positionSimilarity * 0.4);
      
      if (overallSimilarity >= this.fuzzyMatchThreshold && overallSimilarity < 1.0) {
        fuzzyMatches.push({
          ...record,
          match_type: 'fuzzy',
          confidence_score: overallSimilarity,
          company_similarity: companySimilarity,
          position_similarity: positionSimilarity,
          prevention_action: overallSimilarity > this.similarityThreshold ? 'warn_user' : 'suggest_review',
          merge_candidate: overallSimilarity > this.similarityThreshold
        });
      }
    }

    return fuzzyMatches.sort((a, b) => b.confidence_score - a.confidence_score);
  }

  /**
   * Domain-based duplicate detection
   */
  async domainBasedDetection(fromAddress, userId) {
    if (!fromAddress) return [];

    const domain = this.extractDomain(fromAddress);
    if (!domain) return [];

    const domainMatches = this.db.prepare(`
      SELECT ja.job_id, ja.company, ja.job_title, ja.record_source, ja.created_at, ja.status,
             COUNT(je.email_id) as email_count,
             GROUP_CONCAT(DISTINCT je.from_address) as all_from_addresses
      FROM job_applications ja
      LEFT JOIN job_emails je ON ja.job_id = je.job_id
      WHERE ja.user_id = ?
      AND (ja.company_domain = ? OR je.from_address LIKE ?)
      AND ja.created_at > datetime('now', '-90 days')
      GROUP BY ja.job_id
      ORDER BY ja.created_at DESC
    `).all(userId, domain, `%${domain}%`);

    return domainMatches.map(match => ({
      ...match,
      match_type: 'domain',
      confidence_score: 0.8,
      prevention_action: 'warn_user',
      merge_candidate: true,
      domain_match: domain
    }));
  }

  /**
   * Content-based duplicate detection using LLM
   */
  async contentBasedDetection(emailContent, company, position, userId) {
    if (!emailContent || !this.llmEngine) return [];

    try {
      // Use LLM to extract semantic features from email content
      const semanticAnalysis = await this.llmEngine.parseEmailWithContext({
        subject: '',
        plaintext: emailContent,
        recordSource: RECORD_SOURCES.LLM_AUTO
      });

      if (!semanticAnalysis.is_job_related) return [];

      // Find records with similar semantic content
      const recentRecords = this.db.prepare(`
        SELECT job_id, company, job_title, record_source, created_at, original_classification
        FROM job_applications 
        WHERE user_id = ?
        AND llm_processed = 1
        AND created_at > datetime('now', '-60 days')
      `).all(userId);

      const contentMatches = [];

      for (const record of recentRecords) {
        if (record.original_classification) {
          try {
            const originalClassification = JSON.parse(record.original_classification);
            const semanticSimilarity = this.calculateSemanticSimilarity(
              semanticAnalysis,
              originalClassification
            );

            if (semanticSimilarity > 0.7) {
              contentMatches.push({
                ...record,
                match_type: 'content_semantic',
                confidence_score: semanticSimilarity,
                prevention_action: semanticSimilarity > 0.85 ? 'warn_user' : 'suggest_review',
                merge_candidate: semanticSimilarity > 0.8
              });
            }
          } catch (e) {
            // Skip records with invalid classification data
          }
        }
      }

      return contentMatches.sort((a, b) => b.confidence_score - a.confidence_score);
    } catch (error) {
      console.warn('Content-based detection failed:', error.message);
      return [];
    }
  }

  /**
   * Temporal pattern detection (suspicious timing patterns)
   */
  async temporalPatternDetection(company, position, userId) {
    if (!company) return [];

    // Detect multiple applications to same company in short time period
    const temporalMatches = this.db.prepare(`
      SELECT job_id, company, job_title, record_source, created_at, status,
             datetime('now') as current_time,
             (julianday('now') - julianday(created_at)) as days_ago
      FROM job_applications 
      WHERE user_id = ?
      AND LOWER(company) = LOWER(?)
      AND created_at > datetime('now', '-30 days')
      ORDER BY created_at DESC
    `).all(userId, company);

    return temporalMatches
      .filter(match => match.days_ago < 7) // Within last week
      .map(match => ({
        ...match,
        match_type: 'temporal',
        confidence_score: Math.max(0.6, 1.0 - (match.days_ago / 7)),
        prevention_action: 'warn_user',
        merge_candidate: false,
        temporal_pattern: 'rapid_reapplication'
      }));
  }

  /**
   * Advanced string similarity calculation
   */
  calculateAdvancedSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const s1 = this.normalizeString(str1);
    const s2 = this.normalizeString(str2);

    if (s1 === s2) return 1.0;

    // Combined similarity metrics
    const levenshtein = this.levenshteinSimilarity(s1, s2);
    const jaccard = this.jaccardSimilarity(s1, s2);
    const tokenBased = this.tokenBasedSimilarity(s1, s2);

    // Weighted combination
    return (levenshtein * 0.4) + (jaccard * 0.3) + (tokenBased * 0.3);
  }

  /**
   * Normalize string for comparison
   */
  normalizeString(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .replace(/\b(inc|llc|corp|ltd|company|co)\b/gi, '');
  }

  /**
   * Levenshtein similarity
   */
  levenshteinSimilarity(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(str1, str2);
    return (maxLength - distance) / maxLength;
  }

  /**
   * Jaccard similarity
   */
  jaccardSimilarity(str1, str2) {
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Token-based similarity
   */
  tokenBasedSimilarity(str1, str2) {
    const tokens1 = new Set(str1.split(' ').filter(token => token.length > 2));
    const tokens2 = new Set(str2.split(' ').filter(token => token.length > 2));
    
    if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
    if (tokens1.size === 0 || tokens2.size === 0) return 0;
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }

  /**
   * Calculate semantic similarity between LLM classifications
   */
  calculateSemanticSimilarity(classification1, classification2) {
    let similarity = 0;
    let factors = 0;

    // Company similarity
    if (classification1.company && classification2.company) {
      similarity += this.calculateAdvancedSimilarity(classification1.company, classification2.company) * 0.4;
      factors += 0.4;
    }

    // Position similarity
    if (classification1.position && classification2.position) {
      similarity += this.calculateAdvancedSimilarity(classification1.position, classification2.position) * 0.4;
      factors += 0.4;
    }

    // Status similarity
    if (classification1.status && classification2.status) {
      similarity += (classification1.status === classification2.status ? 1.0 : 0.0) * 0.2;
      factors += 0.2;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  /**
   * Assess overall duplicate risk
   */
  assessOverallDuplicateRisk(detectionResults) {
    const [exactMatches, fuzzyMatches, domainMatches, contentMatches, temporalMatches] = detectionResults;

    if (exactMatches.length > 0) {
      return {
        level: 'CRITICAL',
        score: 1.0,
        primary_concern: 'exact_duplicate_exists'
      };
    }

    const highConfidenceFuzzy = fuzzyMatches.filter(m => m.confidence_score > this.similarityThreshold);
    if (highConfidenceFuzzy.length > 0) {
      return {
        level: 'HIGH',
        score: Math.max(...highConfidenceFuzzy.map(m => m.confidence_score)),
        primary_concern: 'high_similarity_match'
      };
    }

    if (domainMatches.length > 0 || contentMatches.length > 0) {
      return {
        level: 'MEDIUM',
        score: 0.7,
        primary_concern: 'domain_or_content_similarity'
      };
    }

    if (temporalMatches.length > 0) {
      return {
        level: 'LOW',
        score: 0.4,
        primary_concern: 'temporal_pattern_detected'
      };
    }

    return {
      level: 'NONE',
      score: 0.0,
      primary_concern: null
    };
  }

  /**
   * Generate recommendation based on detection results
   */
  generateRecommendation(detectionResults) {
    const [exactMatches, fuzzyMatches, domainMatches, contentMatches, temporalMatches] = detectionResults;

    if (exactMatches.length > 0) {
      return {
        action: 'BLOCK',
        message: 'Identical record already exists. Consider updating the existing record instead.',
        suggested_merge_target: exactMatches[0].job_id,
        alternatives: ['update_existing', 'merge_records']
      };
    }

    const highConfidenceFuzzy = fuzzyMatches.filter(m => m.confidence_score > this.similarityThreshold);
    if (highConfidenceFuzzy.length > 0) {
      return {
        action: 'WARN',
        message: 'Very similar record found. Are you sure this is a different application?',
        suggested_merge_target: highConfidenceFuzzy[0].job_id,
        alternatives: ['proceed_anyway', 'merge_with_existing', 'review_existing']
      };
    }

    if (domainMatches.length > 0) {
      return {
        action: 'SUGGEST',
        message: 'Found existing applications to the same company. Consider checking for duplicates.',
        suggested_merge_target: domainMatches[0].job_id,
        alternatives: ['proceed_anyway', 'review_existing']
      };
    }

    return {
      action: 'PROCEED',
      message: 'No significant duplicates detected.',
      alternatives: []
    };
  }

  /**
   * Merge duplicate records with conflict resolution
   */
  async mergeDuplicateRecords(primaryJobId, secondaryJobId, mergeStrategy = 'prefer_manual') {
    const primary = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(primaryJobId);
    const secondary = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(secondaryJobId);

    if (!primary || !secondary) {
      throw new Error('One or both records not found');
    }

    // Determine merge priorities based on record sources
    const mergeRules = this.getMergeRules(primary.record_source, secondary.record_source, mergeStrategy);
    
    // Merge field by field
    const mergedData = {};
    for (const field of ['company', 'job_title', 'status', 'location', 'salary_range', 'notes']) {
      mergedData[field] = this.mergeField(primary[field], secondary[field], mergeRules[field]);
    }

    // Update primary record
    const updateStmt = this.db.prepare(`
      UPDATE job_applications 
      SET company = ?, job_title = ?, status = ?, location = ?, salary_range = ?, notes = ?,
          record_source = ?, updated_at = CURRENT_TIMESTAMP
      WHERE job_id = ?
    `);

    updateStmt.run(
      mergedData.company,
      mergedData.job_title,
      mergedData.status,
      mergedData.location,
      mergedData.salary_range,
      mergedData.notes,
      RECORD_SOURCES.HYBRID,
      primaryJobId
    );

    // Move emails from secondary to primary
    this.db.prepare('UPDATE job_emails SET job_id = ? WHERE job_id = ?').run(primaryJobId, secondaryJobId);
    
    // Move edit history
    this.db.prepare('UPDATE job_edit_history SET job_id = ? WHERE job_id = ?').run(primaryJobId, secondaryJobId);
    
    // Delete secondary record
    this.db.prepare('DELETE FROM job_applications WHERE job_id = ?').run(secondaryJobId);

    return {
      merged_job_id: primaryJobId,
      deleted_job_id: secondaryJobId,
      merged_data: mergedData,
      merge_strategy: mergeStrategy
    };
  }

  /**
   * Get merge rules based on record sources
   */
  getMergeRules(source1, source2, strategy) {
    const defaultRules = {
      company: 'prefer_non_null',
      job_title: 'prefer_non_null',
      status: 'prefer_latest',
      location: 'prefer_non_null',
      salary_range: 'prefer_non_null',
      notes: 'combine'
    };

    if (strategy === 'prefer_manual') {
      if (source1 === RECORD_SOURCES.MANUAL_CREATED || source1 === RECORD_SOURCES.MANUAL_EDITED) {
        return { ...defaultRules, company: 'prefer_first', job_title: 'prefer_first' };
      }
      if (source2 === RECORD_SOURCES.MANUAL_CREATED || source2 === RECORD_SOURCES.MANUAL_EDITED) {
        return { ...defaultRules, company: 'prefer_second', job_title: 'prefer_second' };
      }
    }

    return defaultRules;
  }

  /**
   * Merge individual fields based on rules
   */
  mergeField(value1, value2, rule) {
    switch (rule) {
      case 'prefer_first':
        return value1 || value2;
      case 'prefer_second':
        return value2 || value1;
      case 'prefer_non_null':
        return value1 || value2;
      case 'prefer_latest':
        return value2 || value1; // Assume second is more recent
      case 'combine':
        if (value1 && value2 && value1 !== value2) {
          return `${value1}\n---\n${value2}`;
        }
        return value1 || value2;
      default:
        return value1 || value2;
    }
  }

  /**
   * Extract domain from email address
   */
  extractDomain(email) {
    if (!email || typeof email !== 'string') return null;
    
    const match = email.match(/<(.+)>/) || [null, email];
    const cleanEmail = match[1];
    
    if (!cleanEmail || !cleanEmail.includes('@')) return null;
    
    return cleanEmail.split('@')[1].toLowerCase();
  }

  /**
   * Levenshtein distance implementation
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
   * Clean up expired cache entries
   */
  cleanupExpiredCache() {
    this.db.prepare('DELETE FROM llm_email_cache WHERE expires_at < datetime("now")').run();
  }

  /**
   * Get duplicate statistics for monitoring
   */
  getDuplicateStatistics(userId, days = 30) {
    const stats = this.db.prepare(`
      SELECT 
        record_source,
        COUNT(*) as total_records,
        COUNT(CASE WHEN created_at > datetime('now', '-${days} days') THEN 1 END) as recent_records
      FROM job_applications 
      WHERE user_id = ?
      GROUP BY record_source
    `).all(userId);

    const duplicatePairs = this.db.prepare(`
      SELECT COUNT(*) as potential_duplicates
      FROM job_applications j1
      JOIN job_applications j2 ON j1.company = j2.company 
        AND j1.job_title = j2.job_title 
        AND j1.job_id != j2.job_id
      WHERE j1.user_id = ? AND j1.created_at > datetime('now', '-${days} days')
    `).get(userId);

    return {
      by_source: stats,
      potential_duplicates: duplicatePairs.potential_duplicates,
      last_updated: new Date().toISOString()
    };
  }
}

module.exports = DuplicatePreventionSystem;