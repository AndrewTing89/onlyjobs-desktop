const { spawn } = require('child_process');
const path = require('path');
const Database = require('better-sqlite3');
const { app } = require('electron');

class EnhancedMLHandler {
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'jobs.db');
    this.db = new Database(this.dbPath);
    this.initializeFeedbackTable();
  }

  initializeFeedbackTable() {
    // Create table for storing user corrections
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ml_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id TEXT,
        original_classification TEXT,
        corrected_classification TEXT,
        original_company TEXT,
        corrected_company TEXT,
        original_position TEXT,
        corrected_position TEXT,
        original_email_type TEXT,
        corrected_email_type TEXT,
        feedback_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_feedback_email ON ml_feedback(email_id);
    `);
  }

  async classifyEmail(content, subject = null, fromEmail = null) {
    return new Promise((resolve, reject) => {
      console.log('Enhanced ML Handler: Processing email...');
      
      // First, use the basic classifier for job relevance
      const basicScriptPath = path.join(__dirname, '..', 'ml-classifier', 'scripts', 'classify_email_simple.py');
      const basicClassifier = spawn('python3', [
        basicScriptPath,
        '--text', content,
        '--format', 'json'
      ]);
      
      let basicOutput = '';
      let basicError = '';
      
      basicClassifier.stdout.on('data', (data) => {
        basicOutput += data.toString();
      });
      
      basicClassifier.stderr.on('data', (data) => {
        basicError += data.toString();
      });
      
      basicClassifier.on('close', (code) => {
        let isJobRelated = false;
        let confidence = 0;
        
        if (code === 0 && basicOutput) {
          try {
            const basicResult = JSON.parse(basicOutput);
            isJobRelated = basicResult.is_job_related;
            confidence = basicResult.confidence;
          } catch (e) {
            console.error('Failed to parse basic classifier output:', e);
            // Fallback to keyword detection
            const result = this.fallbackClassifier(content);
            isJobRelated = result.is_job_related;
            confidence = result.confidence;
          }
        } else {
          // Use fallback if Python fails
          const result = this.fallbackClassifier(content);
          isJobRelated = result.is_job_related;
          confidence = result.confidence;
        }
        
        if (!isJobRelated) {
          // Not job related, return early
          resolve({
            is_job_related: false,
            confidence: confidence,
            job_type: null,
            company: null,
            position: null
          });
          return;
        }
        
        // Now use enhanced classifier for type and extraction
        const enhancedScriptPath = path.join(__dirname, '..', 'ml-classifier', 'scripts', 'enhanced_email_classifier.py');
        const args = [
          enhancedScriptPath,
          '--text', content,
          '--format', 'json'
        ];
        
        if (subject) {
          args.push('--subject', subject);
        }
        
        if (fromEmail) {
          args.push('--from', fromEmail);
        }
        
        const enhancedClassifier = spawn('python3', args);
        
        let enhancedOutput = '';
        let enhancedError = '';
        
        enhancedClassifier.stdout.on('data', (data) => {
          enhancedOutput += data.toString();
        });
        
        enhancedClassifier.stderr.on('data', (data) => {
          enhancedError += data.toString();
        });
        
        enhancedClassifier.on('close', (enhancedCode) => {
          if (enhancedCode === 0 && enhancedOutput) {
            try {
              const enhancedResult = JSON.parse(enhancedOutput);
              
              resolve({
                is_job_related: true,
                confidence: confidence,
                job_type: enhancedResult.email_type,
                type_confidence: enhancedResult.type_confidence,
                company: enhancedResult.company,
                position: enhancedResult.position,
                extraction_method: enhancedResult.extraction_method
              });
            } catch (e) {
              console.error('Failed to parse enhanced classifier output:', e);
              // Fallback to basic extraction
              resolve({
                is_job_related: true,
                confidence: confidence,
                job_type: this.detectEmailType(content),
                company: this.extractCompany(content, fromEmail),
                position: this.extractPosition(content)
              });
            }
          } else {
            // Enhanced classifier failed, use fallback
            console.error('Enhanced classifier error:', enhancedError);
            resolve({
              is_job_related: true,
              confidence: confidence,
              job_type: this.detectEmailType(content),
              company: this.extractCompany(content, fromEmail),
              position: this.extractPosition(content)
            });
          }
        });
        
        enhancedClassifier.on('error', (err) => {
          console.error('Failed to start enhanced classifier:', err);
          resolve({
            is_job_related: true,
            confidence: confidence,
            job_type: this.detectEmailType(content),
            company: this.extractCompany(content, fromEmail),
            position: this.extractPosition(content)
          });
        });
      });
      
      basicClassifier.on('error', (err) => {
        console.error('Failed to start basic classifier:', err);
        reject(err);
      });
    });
  }

  // Fallback methods
  fallbackClassifier(content) {
    const lowerContent = content.toLowerCase();
    const jobKeywords = ['interview', 'position', 'application', 'job', 'offer', 'salary', 'career'];
    const score = jobKeywords.filter(kw => lowerContent.includes(kw)).length;
    
    return {
      is_job_related: score > 0,
      confidence: Math.min(0.9, 0.3 + (score * 0.1))
    };
  }

  detectEmailType(content) {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('interview') && !lowerContent.includes('thank you for applying')) {
      return 'interview_request';
    } else if (lowerContent.includes('offer') && lowerContent.includes('salary')) {
      return 'offer';
    } else if (lowerContent.includes('unfortunately') || lowerContent.includes('regret')) {
      return 'rejection';
    } else if (lowerContent.includes('following up')) {
      return 'follow_up';
    } else if (lowerContent.includes('thank you for applying') || lowerContent.includes('application received')) {
      return 'application_confirmation';
    }
    
    return 'application_sent';
  }

  extractCompany(content, fromEmail) {
    // Try to extract from email domain
    if (fromEmail && fromEmail.includes('@')) {
      const domain = fromEmail.split('@')[1].split('.')[0];
      if (!['gmail', 'yahoo', 'outlook', 'hotmail'].includes(domain)) {
        return domain.charAt(0).toUpperCase() + domain.slice(1);
      }
    }
    
    // Try basic pattern matching
    const match = content.match(/(?:at|from|with)\s+([A-Z][A-Za-z0-9\s&\-\.]{2,30})/);
    return match ? match[1].trim() : null;
  }

  extractPosition(content) {
    const match = content.match(/(?:position|role|opportunity)(?:\s+of)?\s+([A-Za-z\s\-]{3,40})/i);
    return match ? match[1].trim() : null;
  }

  // Store user feedback for model improvement
  async storeFeedback(emailId, original, corrected) {
    const stmt = this.db.prepare(`
      INSERT INTO ml_feedback (
        email_id,
        original_classification,
        corrected_classification,
        original_company,
        corrected_company,
        original_position,
        corrected_position,
        original_email_type,
        corrected_email_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      emailId,
      original.is_job_related,
      corrected.is_job_related,
      original.company,
      corrected.company,
      original.position,
      corrected.position,
      original.job_type,
      corrected.job_type
    );
  }

  // Get feedback data for retraining
  async getFeedbackData(limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM ml_feedback 
      ORDER BY feedback_date DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit);
  }

  // Retrain model with feedback (to be called periodically)
  async retrainWithFeedback() {
    const feedback = await this.getFeedbackData(1000);
    
    if (feedback.length < 10) {
      console.log('Not enough feedback data for retraining');
      return false;
    }
    
    // Export feedback to Python for retraining
    const scriptPath = path.join(__dirname, '..', 'ml-classifier', 'scripts', 'retrain_with_feedback.py');
    
    return new Promise((resolve, reject) => {
      const retrain = spawn('python3', [
        scriptPath,
        '--feedback', JSON.stringify(feedback)
      ]);
      
      retrain.on('close', (code) => {
        if (code === 0) {
          console.log('Model retrained successfully with user feedback');
          resolve(true);
        } else {
          console.error('Retraining failed with code:', code);
          resolve(false);
        }
      });
      
      retrain.on('error', (err) => {
        console.error('Failed to start retraining:', err);
        reject(err);
      });
    });
  }
}

module.exports = EnhancedMLHandler;