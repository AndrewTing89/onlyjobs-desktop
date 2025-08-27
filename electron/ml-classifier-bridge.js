const { spawn } = require('child_process');
const path = require('path');

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
          errorOutput += data.toString();
        });

        python.on('close', (code) => {
          if (code !== 0) {
            console.error('ML Classifier error:', errorOutput);
            // Return neutral result on error
            resolve({
              is_job_related: false,
              confidence: 0,
              error: errorOutput || `Python exited with code ${code}`
            });
            return;
          }

          try {
            const result = JSON.parse(output.trim());
            
            // Cache the result
            this.classificationCache.set(cacheKey, {
              result,
              timestamp: Date.now()
            });

            const elapsed = Date.now() - startTime;
            console.log(`📊 ML Classification completed in ${elapsed}ms - Job: ${result.is_job_related} (confidence: ${result.confidence.toFixed(2)})`);
            
            resolve(result);
          } catch (parseError) {
            console.error('Failed to parse ML result:', parseError, 'Output:', output);
            resolve({
              is_job_related: false,
              confidence: 0,
              error: 'Parse error'
            });
          }
        });

        python.on('error', (err) => {
          console.error('Failed to start Python process:', err);
          resolve({
            is_job_related: false,
            confidence: 0,
            error: err.message
          });
        });
      });

    } catch (error) {
      console.error('ML Classifier exception:', error);
      return {
        is_job_related: false,
        confidence: 0,
        error: error.message
      };
    }
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