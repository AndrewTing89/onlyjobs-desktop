const { spawn } = require('child_process');
const path = require('path');
// Training data collector removed - will export classified data directly instead

/**
 * ML Classifier Bridge for Node.js/Electron
 * Provides fast email classification using Python ML model
 */
class MLClassifierBridge {
  constructor() {
    this.pythonPath = 'python3';
    this.scriptPath = path.join(__dirname, '..', 'ml-classifier', 'classify.py');
    this.classificationCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Generate cache key from email content
   */
  getCacheKey(subject, body, sender) {
    return `${subject}::${sender}::${body.substring(0, 200)}`;
  }

  /**
   * Classify email using ML model
   * @param {string} subject - Email subject
   * @param {string} body - Email body
   * @param {string} sender - Email sender
   * @returns {Promise<{is_job_related: boolean, confidence: number}>}
   */
  async classify(subject = '', body = '', sender = '') {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.getCacheKey(subject, body, sender);
    if (this.classificationCache.has(cacheKey)) {
      const cached = this.classificationCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`📊 ML Cache hit (${Date.now() - startTime}ms)`);
        return cached.result;
      }
    }

    try {
      // Prepare input for Python script
      const input = JSON.stringify({
        subject: subject || '',
        body: body || '',
        sender: sender || ''
      });

      // Run Python classifier using child_process
      return new Promise((resolve, reject) => {
        const python = spawn(this.pythonPath, [this.scriptPath, input]);
        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
          output += data.toString();
        });

        python.stderr.on('data', (data) => {
          // Suppress debug output from stderr
          const msg = data.toString();
          if (!msg.includes('===') && !msg.includes('Extracting') && !msg.includes('Processing')) {
            errorOutput += msg;
          }
        });

        python.on('close', (code) => {
          if (code !== 0) {
            console.error('ML Classifier error:', errorOutput);
            // Return neutral result on error
            resolve({
              is_job_related: false,
              job_probability: 0,
              needs_review: false,
              error: errorOutput || `Python exited with code ${code}`
            });
            return;
          }

          try {
            // Extract only JSON from output (last line starting with {)
            const lines = output.trim().split('\n');
            let jsonOutput = '';
            for (let i = lines.length - 1; i >= 0; i--) {
              const line = lines[i].trim();
              if (line.startsWith('{') && line.endsWith('}')) {
                jsonOutput = line;
                break;
              }
            }
            
            if (!jsonOutput) {
              throw new Error('No JSON output found');
            }
            
            const result = JSON.parse(jsonOutput);
            
            // Convert confidence to job_probability and determine is_job_related based on threshold
            const job_probability = result.confidence || 0;
            
            // Check if this is a rejection email that should be reviewed regardless of ML confidence
            const isRejectionEmail = this.isLikelyRejectionEmail(subject, body);
            
            const processedResult = {
              job_probability,
              is_job_related: job_probability >= 0.9,  // Only mark as job if 90%+ probability
              needs_review: isRejectionEmail || (job_probability >= 0.3 && job_probability < 0.9),  // Rejection emails always need review
              model_type: result.model_type,
              error: result.error
            };
            
            // Cache the result
            this.classificationCache.set(cacheKey, {
              result: processedResult,
              timestamp: Date.now()
            });

            const elapsed = Date.now() - startTime;
            // Removed console.log that was causing EPIPE error
            // ML Classification completed in Xms
            
            // Training data capture removed - will export classified data directly instead
            
            resolve(processedResult);
          } catch (parseError) {
            console.error('Failed to parse ML result:', parseError.message);
            resolve({
              is_job_related: false,
              job_probability: 0,
              needs_review: false,
              error: 'Parse error',
              model_type: 'rule_based'
            });
          }
        });

        python.on('error', (err) => {
          console.error('Failed to start Python process:', err);
          resolve({
            is_job_related: false,
            job_probability: 0,
            needs_review: false,
            error: err.message
          });
        });
      });

    } catch (error) {
      console.error('ML Classifier exception:', error);
      return {
        is_job_related: false,
        job_probability: 0,
        needs_review: false,
        error: error.message
      };
    }
  }

  /**
   * Check if email is likely a rejection that should be reviewed regardless of ML confidence
   */
  isLikelyRejectionEmail(subject, body) {
    if (!subject && !body) return false;
    
    const subjectLower = (subject || '').toLowerCase();
    const bodyLower = (body || '').toLowerCase();
    const combined = subjectLower + ' ' + bodyLower;
    
    // Must have application-related subject
    const hasApplicationSubject = subjectLower.includes('application') || 
                                  subjectLower.includes('your update from') ||
                                  subjectLower.includes('applied');
    
    if (!hasApplicationSubject) return false;
    
    // Look for rejection indicators
    const rejectionIndicators = [
      'unfortunately',
      'regret to inform',
      'not moving forward',
      'not proceeding',
      'decided to move',
      'decided to go',
      'decided to proceed',
      'position has been filled',
      'thank you for your interest',
      'we will not be',
      'not selected',
      'not be moving forward'
    ];
    
    // Check if content contains rejection language
    const hasRejectionLanguage = rejectionIndicators.some(indicator => 
      combined.includes(indicator)
    );
    
    // Must be from LinkedIn (since these are the problematic ones)
    const isLinkedIn = combined.includes('linkedin');
    
    return hasApplicationSubject && hasRejectionLanguage && isLinkedIn;
  }

  /**
   * Batch classify multiple emails
   * @param {Array} emails - Array of {subject, body, sender} objects
   * @returns {Promise<Array>} Classification results
   */
  async batchClassify(emails) {
    console.log(`📊 Batch classifying ${emails.length} emails with ML...`);
    const startTime = Date.now();
    
    const results = await Promise.all(
      emails.map(email => this.classify(email.subject, email.body, email.sender))
    );
    
    const elapsed = Date.now() - startTime;
    const jobCount = results.filter(r => r.is_job_related).length;
    console.log(`📊 ML Batch complete: ${jobCount}/${emails.length} job-related (${elapsed}ms total, ${(elapsed/emails.length).toFixed(1)}ms avg)`);
    
    return results;
  }

  /**
   * Get statistics about ML classifier performance
   */
  getStats() {
    return {
      cacheSize: this.classificationCache.size,
      cacheTimeout: this.cacheTimeout,
      scriptPath: this.scriptPath
    };
  }

  /**
   * Clear classification cache
   */
  clearCache() {
    const size = this.classificationCache.size;
    this.classificationCache.clear();
    console.log(`📊 ML Cache cleared (${size} entries)`);
  }

  // Training data capture removed - will export classified data directly instead
}

// Singleton instance
let instance = null;

module.exports = {
  /**
   * Get ML Classifier instance
   */
  getMLClassifier() {
    if (!instance) {
      instance = new MLClassifierBridge();
    }
    return instance;
  },

  /**
   * Direct classification function
   */
  async classifyEmail(subject, body, sender) {
    const classifier = this.getMLClassifier();
    return classifier.classify(subject, body, sender);
  }
};