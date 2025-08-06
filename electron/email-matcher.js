/**
 * Email Matching and Job Application Grouping System
 * 
 * This module handles matching related emails to track job application journeys
 */

const Database = require('better-sqlite3');
const path = require('path');

class EmailMatcher {
  constructor(dbPath) {
    this.db = new Database(dbPath || path.join(__dirname, '../jobs.db'));
    this.initializeDatabase();
  }

  initializeDatabase() {
    // Enhanced schema with relationship tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS job_applications (
        job_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        thread_id TEXT,
        company TEXT,
        company_domain TEXT,
        job_title TEXT,
        normalized_job_title TEXT,
        location TEXT,
        status TEXT,
        first_contact_date DATETIME,
        last_contact_date DATETIME,
        email_count INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS job_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        email_id TEXT UNIQUE NOT NULL,
        gmail_thread_id TEXT,
        subject TEXT,
        from_address TEXT,
        email_date DATETIME,
        detected_status TEXT,
        content_snippet TEXT,
        raw_content TEXT,
        is_primary_email BOOLEAN DEFAULT 0,
        FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
      );

      CREATE TABLE IF NOT EXISTS job_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        email_id TEXT,
        change_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES job_applications (job_id)
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_thread_id ON job_applications(thread_id);
      CREATE INDEX IF NOT EXISTS idx_company_domain ON job_applications(company_domain);
      CREATE INDEX IF NOT EXISTS idx_normalized_title ON job_applications(normalized_job_title);
      CREATE INDEX IF NOT EXISTS idx_gmail_thread ON job_emails(gmail_thread_id);
    `);
  }

  /**
   * Process a new email and match it to existing job applications
   */
  async processEmail(emailData, classificationResult) {
    const {
      id: email_id,
      threadId: thread_id,
      subject,
      from,
      date,
      snippet,
      content
    } = emailData;

    const {
      company,
      job_title,
      location,
      status,
      confidence
    } = classificationResult;

    // Extract company domain for better matching
    const company_domain = this.extractCompanyDomain(from);
    const normalized_job_title = this.normalizeJobTitle(job_title);

    // Try to find existing job application
    let jobId = await this.findMatchingJob({
      thread_id,
      company,
      company_domain,
      normalized_job_title,
      email_date: date
    });

    if (jobId) {
      // Update existing job
      await this.updateJobApplication(jobId, {
        status,
        last_contact_date: date,
        email_count: this.db.prepare('SELECT email_count FROM job_applications WHERE job_id = ?').get(jobId).email_count + 1
      });
    } else {
      // Create new job application
      jobId = await this.createJobApplication({
        thread_id,
        company,
        company_domain,
        job_title,
        normalized_job_title,
        location,
        status,
        first_contact_date: date,
        last_contact_date: date
      });
    }

    // Add email to job
    await this.addEmailToJob(jobId, {
      email_id,
      gmail_thread_id: thread_id,
      subject,
      from_address: from,
      email_date: date,
      detected_status: status,
      content_snippet: snippet,
      raw_content: content,
      is_primary_email: !jobId // First email is primary
    });

    // Update status history
    await this.addStatusHistory(jobId, status, email_id);

    return jobId;
  }

  /**
   * Find matching job application using multiple strategies
   */
  async findMatchingJob({ thread_id, company, company_domain, normalized_job_title, email_date }) {
    // Strategy 1: Gmail Thread ID (most reliable)
    if (thread_id) {
      const threadMatch = this.db.prepare(`
        SELECT DISTINCT ja.job_id 
        FROM job_applications ja
        JOIN job_emails je ON ja.job_id = je.job_id
        WHERE je.gmail_thread_id = ?
        LIMIT 1
      `).get(thread_id);
      
      if (threadMatch) return threadMatch.job_id;
    }

    // Strategy 2: Company + Job Title matching (within 90 days)
    if (company && normalized_job_title) {
      const companyJobMatch = this.db.prepare(`
        SELECT job_id 
        FROM job_applications 
        WHERE company_domain = ? 
        AND normalized_job_title = ?
        AND datetime(last_contact_date) > datetime(?, '-90 days')
        ORDER BY last_contact_date DESC
        LIMIT 1
      `).get(company_domain, normalized_job_title, email_date);
      
      if (companyJobMatch) return companyJobMatch.job_id;
    }

    // Strategy 3: Fuzzy matching on company name and similar job titles
    if (company) {
      const fuzzyMatch = this.db.prepare(`
        SELECT job_id, job_title,
          (CASE 
            WHEN company = ? THEN 1.0
            WHEN company LIKE ? THEN 0.8
            ELSE 0.5
          END) as company_score
        FROM job_applications
        WHERE (company = ? OR company LIKE ? OR company_domain = ?)
        AND datetime(last_contact_date) > datetime(?, '-90 days')
        ORDER BY company_score DESC, last_contact_date DESC
        LIMIT 5
      `).all(
        company,
        `%${company}%`,
        company,
        `%${company}%`,
        company_domain,
        email_date
      );

      // Check job title similarity
      for (const match of fuzzyMatch) {
        if (this.calculateTitleSimilarity(match.job_title, normalized_job_title) > 0.7) {
          return match.job_id;
        }
      }
    }

    return null;
  }

  /**
   * Extract company domain from email address
   */
  extractCompanyDomain(fromEmail) {
    // Extract email from "Name <email@domain.com>" format
    const emailMatch = fromEmail.match(/<(.+)>/) || [null, fromEmail];
    const email = emailMatch[1];
    
    if (!email) return null;
    
    const domain = email.split('@')[1];
    if (!domain) return null;

    // Remove common email service domains
    const excludeDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
    if (excludeDomains.includes(domain.toLowerCase())) return null;

    // Extract company name from domain (e.g., 'mail.company.com' -> 'company.com')
    const parts = domain.split('.');
    if (parts.length > 2) {
      // Check for known subdomains
      const subdomains = ['mail', 'email', 'careers', 'jobs', 'recruiting', 'hire'];
      if (subdomains.includes(parts[0].toLowerCase())) {
        return parts.slice(1).join('.');
      }
    }

    return domain;
  }

  /**
   * Normalize job title for better matching
   */
  normalizeJobTitle(title) {
    if (!title) return null;

    return title
      .toLowerCase()
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .replace(/\b(sr|jr|senior|junior|lead|principal|staff)\b/g, '') // Remove seniority
      .replace(/\b(i{1,3}|iv|v|vi{1,3}|ix|x)\b/g, '') // Remove roman numerals
      .replace(/\b\d+\b/g, '') // Remove numbers
      .replace(/[^\w\s]/g, '') // Remove special characters
      .trim();
  }

  /**
   * Calculate similarity between two job titles
   */
  calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;

    const norm1 = this.normalizeJobTitle(title1);
    const norm2 = this.normalizeJobTitle(title2);

    // Exact match after normalization
    if (norm1 === norm2) return 1.0;

    // Token-based similarity
    const tokens1 = new Set(norm1.split(' '));
    const tokens2 = new Set(norm2.split(' '));
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }

  /**
   * Create a new job application
   */
  async createJobApplication(data) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const stmt = this.db.prepare(`
      INSERT INTO job_applications (
        job_id, user_id, thread_id, company, company_domain,
        job_title, normalized_job_title, location, status,
        first_contact_date, last_contact_date, email_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      jobId,
      data.user_id || 'default',
      data.thread_id,
      data.company,
      data.company_domain,
      data.job_title,
      data.normalized_job_title,
      data.location,
      data.status,
      data.first_contact_date,
      data.last_contact_date,
      1
    );

    return jobId;
  }

  /**
   * Update existing job application
   */
  async updateJobApplication(jobId, updates) {
    const setClause = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const stmt = this.db.prepare(`
      UPDATE job_applications 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE job_id = ?
    `);

    stmt.run(...Object.values(updates), jobId);
  }

  /**
   * Add email to job application
   */
  async addEmailToJob(jobId, emailData) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO job_emails (
        job_id, email_id, gmail_thread_id, subject,
        from_address, email_date, detected_status,
        content_snippet, raw_content, is_primary_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      jobId,
      emailData.email_id,
      emailData.gmail_thread_id,
      emailData.subject,
      emailData.from_address,
      emailData.email_date,
      emailData.detected_status,
      emailData.content_snippet,
      emailData.raw_content,
      emailData.is_primary_email ? 1 : 0
    );
  }

  /**
   * Add status change to history
   */
  async addStatusHistory(jobId, status, emailId) {
    const stmt = this.db.prepare(`
      INSERT INTO job_status_history (job_id, status, email_id)
      VALUES (?, ?, ?)
    `);

    stmt.run(jobId, status, emailId);
  }

  /**
   * Get complete job application with all related emails
   */
  getJobWithEmails(jobId) {
    const job = this.db.prepare(`
      SELECT * FROM job_applications WHERE job_id = ?
    `).get(jobId);

    if (!job) return null;

    job.emails = this.db.prepare(`
      SELECT * FROM job_emails 
      WHERE job_id = ? 
      ORDER BY email_date ASC
    `).all(jobId);

    job.status_history = this.db.prepare(`
      SELECT * FROM job_status_history 
      WHERE job_id = ? 
      ORDER BY change_date ASC
    `).all(jobId);

    return job;
  }

  /**
   * Get all jobs for a user with email counts
   */
  getUserJobs(userId) {
    return this.db.prepare(`
      SELECT 
        ja.*,
        COUNT(je.email_id) as total_emails,
        MAX(je.email_date) as latest_email_date
      FROM job_applications ja
      LEFT JOIN job_emails je ON ja.job_id = je.job_id
      WHERE ja.user_id = ?
      GROUP BY ja.job_id
      ORDER BY ja.last_contact_date DESC
    `).all(userId);
  }
}

module.exports = EmailMatcher;