const { createHash } = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

/**
 * Training Data Collector
 * Captures user corrections and valuable training examples for ML model improvement
 */
class TrainingDataCollector {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection and create training feedback table
   */
  initializeDb() {
    if (!this.db) {
      const dbPath = path.join(app.getPath('userData'), 'jobs.db');
      this.db = new Database(dbPath);
    }

    if (!this.initialized) {
      this.createTrainingTable();
      this.initialized = true;
    }
  }

  /**
   * Create training_feedback table for storing corrections and training examples
   */
  createTrainingTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS training_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_hash TEXT UNIQUE NOT NULL,
        gmail_message_id TEXT,
        account_email TEXT,
        
        -- Email content (anonymized if needed)
        subject TEXT NOT NULL,
        body_snippet TEXT NOT NULL,
        sender_domain TEXT NOT NULL,
        
        -- Original ML classification
        original_prediction BOOLEAN,
        original_confidence REAL,
        model_version TEXT,
        
        -- User correction/actual label
        user_classification BOOLEAN NOT NULL,
        correction_type TEXT CHECK(correction_type IN ('manual_correction', 'low_confidence_review', 'edge_case')) NOT NULL,
        
        -- Context about the correction
        confidence_threshold REAL,
        correction_reason TEXT,
        user_feedback TEXT,
        
        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        exported_at TIMESTAMP NULL,
        is_valuable_example BOOLEAN DEFAULT 1,
        
        -- Feature importance for analysis
        features_json TEXT
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_training_email_hash ON training_feedback(email_hash);
      CREATE INDEX IF NOT EXISTS idx_training_created_at ON training_feedback(created_at);
      CREATE INDEX IF NOT EXISTS idx_training_correction_type ON training_feedback(correction_type);
      CREATE INDEX IF NOT EXISTS idx_training_exported ON training_feedback(exported_at);
    `);

    console.log('📊 Training feedback table initialized');
  }

  /**
   * Generate consistent hash for email content to prevent duplicates
   * @param {string} subject - Email subject
   * @param {string} body - Email body (truncated)
   * @param {string} sender - Email sender
   * @returns {string} SHA-256 hash
   */
  generateEmailHash(subject, body, sender) {
    const content = `${subject}|${sender}|${body.substring(0, 1000)}`;
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Extract domain from email address
   * @param {string} email - Email address
   * @returns {string} Domain part
   */
  extractDomain(email) {
    if (!email || !email.includes('@')) return 'unknown';
    return email.split('@')[1].toLowerCase();
  }

  /**
   * Determine if this example is valuable for training
   * @param {Object} data - Training data object
   * @returns {boolean} Whether this is a valuable training example
   */
  isValuableExample(data) {
    // Always valuable if it's a user correction
    if (data.correctionType === 'manual_correction') return true;
    
    // Valuable if low confidence (model was uncertain)
    if (data.originalConfidence !== null && data.originalConfidence < 0.7) return true;
    
    // Valuable if marked as edge case
    if (data.correctionType === 'edge_case') return true;
    
    // Otherwise, use some heuristics
    const subject = data.subject.toLowerCase();
    const bodySnippet = data.bodySnippet.toLowerCase();
    
    // Valuable if contains ambiguous keywords
    const ambiguousKeywords = [
      'newsletter', 'update', 'notification', 'reminder',
      'thank you', 'thanks', 'confirmation', 'receipt'
    ];
    
    const hasAmbiguousContent = ambiguousKeywords.some(keyword => 
      subject.includes(keyword) || bodySnippet.includes(keyword)
    );
    
    return hasAmbiguousContent;
  }

  /**
   * Capture a user correction as training data
   * @param {Object} correctionData - User correction data
   * @returns {Promise<boolean>} Success status
   */
  async captureCorrection(correctionData) {
    try {
      this.initializeDb();

      const {
        gmailMessageId,
        accountEmail,
        subject,
        body,
        sender,
        originalPrediction,
        originalConfidence,
        userClassification,
        correctionType = 'manual_correction',
        correctionReason = null,
        userFeedback = null,
        modelVersion = 'xgboost_v1'
      } = correctionData;

      // Generate hash to prevent duplicates
      const emailHash = this.generateEmailHash(subject, body, sender);
      const senderDomain = this.extractDomain(sender);
      const bodySnippet = body.substring(0, 500); // Store first 500 chars

      // Check if we already have this example
      const existing = this.db.prepare(`
        SELECT id FROM training_feedback WHERE email_hash = ?
      `).get(emailHash);

      if (existing) {
        console.log(`📊 Training example already exists for hash: ${emailHash}`);
        return false;
      }

      // Determine if this is a valuable example
      const isValuable = this.isValuableExample({
        subject,
        bodySnippet,
        originalConfidence,
        correctionType
      });

      // Extract features for analysis (basic feature extraction)
      const features = this.extractFeatures(subject, bodySnippet, senderDomain);

      // Insert training example
      const stmt = this.db.prepare(`
        INSERT INTO training_feedback (
          email_hash, gmail_message_id, account_email,
          subject, body_snippet, sender_domain,
          original_prediction, original_confidence, model_version,
          user_classification, correction_type,
          correction_reason, user_feedback,
          is_valuable_example, features_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        emailHash,
        gmailMessageId,
        accountEmail,
        subject,
        bodySnippet,
        senderDomain,
        originalPrediction ? 1 : 0,
        originalConfidence,
        modelVersion,
        userClassification ? 1 : 0,
        correctionType,
        correctionReason,
        userFeedback,
        isValuable ? 1 : 0,
        JSON.stringify(features)
      );

      console.log(`📊 Captured training example: ${correctionType} - Job: ${userClassification}, Original: ${originalPrediction}, Confidence: ${originalConfidence}`);
      
      return true;
    } catch (error) {
      console.error('Error capturing training data:', error);
      return false;
    }
  }

  /**
   * Extract basic features from email for analysis
   * @param {string} subject - Email subject
   * @param {string} bodySnippet - Email body snippet
   * @param {string} senderDomain - Sender domain
   * @returns {Object} Feature object
   */
  extractFeatures(subject, bodySnippet, senderDomain) {
    const features = {
      // Text statistics
      subject_length: subject.length,
      body_length: bodySnippet.length,
      subject_word_count: subject.split(' ').length,
      
      // Domain features
      sender_domain: senderDomain,
      is_common_domain: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(senderDomain),
      
      // Content features
      has_job_keywords: this.hasJobKeywords(subject + ' ' + bodySnippet),
      has_company_signature: bodySnippet.includes('@') && bodySnippet.includes('://'),
      has_application_keywords: this.hasApplicationKeywords(subject + ' ' + bodySnippet),
      has_rejection_keywords: this.hasRejectionKeywords(subject + ' ' + bodySnippet),
      
      // Structure features
      subject_has_re: subject.toLowerCase().startsWith('re:'),
      subject_has_fwd: subject.toLowerCase().startsWith('fwd:'),
      
      // Timestamp
      extracted_at: new Date().toISOString()
    };

    return features;
  }

  /**
   * Check if text contains job-related keywords
   */
  hasJobKeywords(text) {
    const jobKeywords = [
      'position', 'role', 'job', 'career', 'hiring', 'recruit',
      'application', 'interview', 'candidate', 'resume'
    ];
    const lowerText = text.toLowerCase();
    return jobKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Check if text contains application-related keywords
   */
  hasApplicationKeywords(text) {
    const appKeywords = [
      'applied', 'application', 'apply', 'submit', 'submitted',
      'thank you for', 'received your', 'we have received'
    ];
    const lowerText = text.toLowerCase();
    return appKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Check if text contains rejection keywords
   */
  hasRejectionKeywords(text) {
    const rejectionKeywords = [
      'unfortunately', 'not selected', 'declined', 'reject',
      'not moving forward', 'different direction', 'not a match'
    ];
    const lowerText = text.toLowerCase();
    return rejectionKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Capture low-confidence prediction for review
   * @param {Object} lowConfidenceData - Low confidence prediction data
   * @returns {Promise<boolean>} Success status
   */
  async captureLowConfidence(lowConfidenceData) {
    return this.captureCorrection({
      ...lowConfidenceData,
      correctionType: 'low_confidence_review',
      userClassification: lowConfidenceData.originalPrediction, // Use original as default
      correctionReason: `Low confidence: ${lowConfidenceData.originalConfidence}`
    });
  }

  /**
   * Get training data statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    try {
      this.initializeDb();

      const totalExamples = this.db.prepare(`
        SELECT COUNT(*) as count FROM training_feedback
      `).get().count;

      const correctionTypes = this.db.prepare(`
        SELECT correction_type, COUNT(*) as count 
        FROM training_feedback 
        GROUP BY correction_type
      `).all();

      const accuracyStats = this.db.prepare(`
        SELECT 
          AVG(CASE WHEN original_prediction = user_classification THEN 1.0 ELSE 0.0 END) as accuracy,
          AVG(original_confidence) as avg_confidence,
          COUNT(CASE WHEN original_prediction != user_classification THEN 1 END) as corrections_made
        FROM training_feedback
        WHERE original_prediction IS NOT NULL
      `).get();

      const recentActivity = this.db.prepare(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM training_feedback
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `).all();

      const valuableExamples = this.db.prepare(`
        SELECT COUNT(*) as count FROM training_feedback WHERE is_valuable_example = 1
      `).get().count;

      const exportedExamples = this.db.prepare(`
        SELECT COUNT(*) as count FROM training_feedback WHERE exported_at IS NOT NULL
      `).get().count;

      return {
        totalExamples,
        valuableExamples,
        exportedExamples,
        correctionTypes: correctionTypes.reduce((acc, row) => {
          acc[row.correction_type] = row.count;
          return acc;
        }, {}),
        accuracy: accuracyStats.accuracy || 0,
        averageConfidence: accuracyStats.avg_confidence || 0,
        correctionsMade: accuracyStats.corrections_made || 0,
        recentActivity
      };
    } catch (error) {
      console.error('Error getting training stats:', error);
      return {
        totalExamples: 0,
        valuableExamples: 0,
        exportedExamples: 0,
        correctionTypes: {},
        accuracy: 0,
        averageConfidence: 0,
        correctionsMade: 0,
        recentActivity: []
      };
    }
  }

  /**
   * Get common misclassification patterns
   * @returns {Array} Array of pattern objects
   */
  getPatterns() {
    try {
      this.initializeDb();

      // Get most common domains that get misclassified
      const domainPatterns = this.db.prepare(`
        SELECT 
          sender_domain,
          COUNT(*) as total_count,
          COUNT(CASE WHEN original_prediction != user_classification THEN 1 END) as misclassified_count,
          AVG(original_confidence) as avg_confidence
        FROM training_feedback
        WHERE original_prediction IS NOT NULL
        GROUP BY sender_domain
        HAVING total_count >= 3
        ORDER BY misclassified_count DESC, total_count DESC
        LIMIT 10
      `).all();

      // Get keyword patterns in misclassified emails
      const keywordPatterns = this.db.prepare(`
        SELECT 
          subject,
          body_snippet,
          original_prediction,
          user_classification,
          original_confidence
        FROM training_feedback
        WHERE original_prediction IS NOT NULL 
          AND original_prediction != user_classification
        ORDER BY created_at DESC
        LIMIT 20
      `).all();

      return {
        domainPatterns: domainPatterns.map(row => ({
          domain: row.sender_domain,
          totalEmails: row.total_count,
          misclassified: row.misclassified_count,
          errorRate: row.misclassified_count / row.total_count,
          averageConfidence: row.avg_confidence
        })),
        recentMisclassifications: keywordPatterns.map(row => ({
          subject: row.subject,
          bodySnippet: row.body_snippet.substring(0, 100) + '...',
          predicted: row.original_prediction,
          actual: row.user_classification,
          confidence: row.original_confidence
        }))
      };
    } catch (error) {
      console.error('Error getting patterns:', error);
      return {
        domainPatterns: [],
        recentMisclassifications: []
      };
    }
  }

  /**
   * Clean up old training data (older than specified days)
   * @param {number} daysToKeep - Days to keep data
   * @returns {number} Number of rows deleted
   */
  cleanup(daysToKeep = 90) {
    try {
      this.initializeDb();

      const result = this.db.prepare(`
        DELETE FROM training_feedback 
        WHERE created_at < datetime('now', '-${daysToKeep} days')
          AND exported_at IS NOT NULL
      `).run();

      console.log(`📊 Cleaned up ${result.changes} old training examples`);
      return result.changes;
    } catch (error) {
      console.error('Error cleaning up training data:', error);
      return 0;
    }
  }
}

// Singleton instance
let instance = null;

module.exports = {
  /**
   * Get Training Data Collector instance
   */
  getTrainingDataCollector() {
    if (!instance) {
      instance = new TrainingDataCollector();
    }
    return instance;
  },

  /**
   * Direct capture functions for convenience
   */
  async captureUserCorrection(correctionData) {
    const collector = this.getTrainingDataCollector();
    return collector.captureCorrection(correctionData);
  },

  async captureLowConfidencePrediction(lowConfidenceData) {
    const collector = this.getTrainingDataCollector();
    return collector.captureLowConfidence(lowConfidenceData);
  }
};