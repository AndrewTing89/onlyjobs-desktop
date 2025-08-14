/**
 * Integrated Email Processor
 * Combines Gmail fetching, ML classification, and email matching
 */

const EmailMatcher = require('./email-matcher');
const path = require('path');
const Database = require('better-sqlite3');

class IntegratedEmailProcessor {
  constructor(gmailAuth, mlHandler) {
    this.gmailAuth = gmailAuth;
    // Use the clean LLM classifier provider
    const { getClassifierProvider } = require('./classifier/providerFactory');
    this.mlHandler = mlHandler || getClassifierProvider();
    this.emailMatcher = new EmailMatcher();
    
    // Initialize job summary database
    const appDir = path.join(require('os').homedir(), 'Library', 'Application Support', 'onlyjobs-desktop');
    this.db = new Database(path.join(appDir, 'jobs.db'));
  }

  /**
   * Process a batch of emails with matching
   */
  async processEmails(messages, userId = 'default') {
    const results = {
      processed: 0,
      newJobs: 0,
      updatedJobs: 0,
      errors: []
    };

    for (const message of messages) {
      try {
        // Extract email data
        const emailData = this.extractEmailData(message);
        
        // Classify email with enhanced header context
        const emailHeaders = this.extractHeaders(message);
        const classification = await this.mlHandler.parse({
          subject: emailData.subject,
          plaintext: emailData.content,
          fromAddress: emailData.from,
          headers: emailHeaders
        });

        // Skip if not job-related
        if (!classification.is_job_related || classification.confidence < 0.6) {
          continue;
        }

        // Process with email matcher
        const jobId = await this.emailMatcher.processEmail(
          emailData,
          {
            company: classification.company || this.extractCompanyFromEmail(emailData),
            job_title: classification.position || this.extractJobTitleFromSubject(emailData.subject),
            location: classification.location,
            status: classification.status || this.detectStatus(emailData, classification),
            confidence: classification.confidence
          }
        );

        // Check if this created a new job or updated existing
        const emailCount = this.db.prepare('SELECT email_count FROM job_applications WHERE job_id = ?').get(jobId);
        if (emailCount && emailCount.email_count === 1) {
          results.newJobs++;
        } else {
          results.updatedJobs++;
        }

        results.processed++;

        // Emit event for UI updates
        this.gmailAuth.emit('job-found', {
          jobId,
          isNew: emailCount && emailCount.email_count === 1,
          company: classification.company,
          job_title: classification.position,
          status: classification.status,
          emailCount: emailCount ? emailCount.email_count : 1
        });

      } catch (error) {
        console.error('Error processing email:', error);
        results.errors.push({
          messageId: message.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Extract headers from Gmail message for enhanced context
   */
  extractHeaders(message) {
    const payload = message.payload || {};
    const headers = payload.headers || [];
    
    const headerMap = {};
    headers.forEach(header => {
      headerMap[header.name] = header.value;
    });
    
    return headerMap;
  }

  /**
   * Extract structured data from Gmail message
   */
  extractEmailData(message) {
    const payload = message.payload || {};
    const headers = payload.headers || [];
    
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    const messageId = headers.find(h => h.name === 'Message-ID')?.value || message.id;

    // Extract email content
    let content = '';
    const extractContent = (part) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        content += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        part.parts.forEach(extractContent);
      }
    };

    if (payload.parts) {
      payload.parts.forEach(extractContent);
    } else if (payload.body?.data) {
      content = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id: message.id,
      threadId: message.threadId,
      messageId,
      subject,
      from,
      date: new Date(date).toISOString(),
      snippet: message.snippet || '',
      content,
      accountEmail: message.accountEmail
    };
  }

  /**
   * Detect job application status from email content
   */
  detectStatus(emailData, classification) {
    const { subject, content } = emailData;
    const combined = `${subject} ${content}`.toLowerCase();

    // Priority order for status detection
    if (classification.status) {
      return classification.status;
    }

    if (combined.includes('congratulations') || 
        combined.includes('job offer') || 
        combined.includes('we are pleased to offer')) {
      return 'Offer';
    }

    if (combined.includes('interview') || 
        combined.includes('schedule a call') ||
        combined.includes('next step') ||
        combined.includes('phone screen')) {
      return 'Interview';
    }

    if (combined.includes('unfortunately') || 
        combined.includes('not selected') ||
        combined.includes('decided not to proceed') ||
        combined.includes('other candidates')) {
      return 'Declined';
    }

    if (combined.includes('application received') || 
        combined.includes('thank you for applying') ||
        combined.includes('we have received your application')) {
      return 'Applied';
    }

    return 'Applied'; // Default status
  }

  /**
   * Extract company name from email if not detected by ML
   */
  extractCompanyFromEmail(emailData) {
    // Try to extract from email domain
    const domain = this.emailMatcher.extractCompanyDomain(emailData.from);
    if (domain) {
      // Convert domain to company name (e.g., 'google.com' -> 'Google')
      const company = domain.split('.')[0];
      return company.charAt(0).toUpperCase() + company.slice(1);
    }

    // Try to extract from subject line patterns
    const subjectPatterns = [
      /^(.+?)\s*-\s*Job Application/i,
      /^(.+?)\s*:\s*Application/i,
      /Application at\s+(.+?)$/i,
      /Position at\s+(.+?)$/i
    ];

    for (const pattern of subjectPatterns) {
      const match = emailData.subject.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return 'Unknown Company';
  }

  /**
   * Extract job title from subject if not detected by ML
   */
  extractJobTitleFromSubject(subject) {
    // Common patterns in email subjects
    const patterns = [
      /Application for\s+(.+?)$/i,
      /Your application for\s+(.+?)$/i,
      /Re:\s*(.+?)\s*Application/i,
      /Position:\s*(.+?)$/i,
      /Role:\s*(.+?)$/i,
      /(.+?)\s*-\s*Application/i
    ];

    for (const pattern of patterns) {
      const match = subject.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return 'Unknown Position';
  }

  /**
   * Get job application timeline for a specific job
   */
  getJobTimeline(jobId) {
    return this.emailMatcher.getJobWithEmails(jobId);
  }

  /**
   * Get all jobs with their current status
   */
  getAllJobs(userId = 'default') {
    return this.emailMatcher.getUserJobs(userId);
  }

  /**
   * Find potential duplicate jobs that should be merged
   */
  async findDuplicateJobs(userId = 'default') {
    const jobs = this.getAllJobs(userId);
    const duplicates = [];

    for (let i = 0; i < jobs.length; i++) {
      for (let j = i + 1; j < jobs.length; j++) {
        const job1 = jobs[i];
        const job2 = jobs[j];

        // Check for similarity
        const companyMatch = job1.company === job2.company || 
                           job1.company_domain === job2.company_domain;
        
        const titleSimilarity = this.emailMatcher.calculateTitleSimilarity(
          job1.job_title, 
          job2.job_title
        );

        // If same company and similar title, likely duplicates
        if (companyMatch && titleSimilarity > 0.7) {
          duplicates.push({
            job1: job1.job_id,
            job2: job2.job_id,
            company: job1.company,
            similarity: titleSimilarity
          });
        }
      }
    }

    return duplicates;
  }

  /**
   * Merge duplicate jobs
   */
  async mergeJobs(primaryJobId, secondaryJobId) {
    // Move all emails from secondary to primary
    this.db.prepare(`
      UPDATE job_emails 
      SET job_id = ? 
      WHERE job_id = ?
    `).run(primaryJobId, secondaryJobId);

    // Move status history
    this.db.prepare(`
      UPDATE job_status_history 
      SET job_id = ? 
      WHERE job_id = ?
    `).run(primaryJobId, secondaryJobId);

    // Update primary job with latest info
    const secondary = this.db.prepare('SELECT * FROM job_applications WHERE job_id = ?').get(secondaryJobId);
    if (secondary) {
      this.db.prepare(`
        UPDATE job_applications 
        SET 
          last_contact_date = MAX(last_contact_date, ?),
          email_count = email_count + ?,
          status = ?
        WHERE job_id = ?
      `).run(
        secondary.last_contact_date,
        secondary.email_count,
        secondary.status,
        primaryJobId
      );
    }

    // Delete secondary job
    this.db.prepare('DELETE FROM job_applications WHERE job_id = ?').run(secondaryJobId);

    return primaryJobId;
  }
}

module.exports = IntegratedEmailProcessor;