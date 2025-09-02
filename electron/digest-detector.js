/**
 * Digest Detector Module
 * 
 * Filters out job digest/newsletter/advertisement emails
 * before they reach ML classification.
 * 
 * This is a lightweight pre-filter that catches obvious
 * job board newsletters and recommendations, allowing only
 * actual job application-related emails through.
 */

class DigestDetector {
  constructor() {
    // Job board and newsletter domains
    this.digestDomains = [
      'linkedin.com',
      'glassdoor.com',
      'indeed.com',
      'monster.com',
      'ziprecruiter.com',
      'careerbuilder.com',
      'dice.com',
      'angel.co',
      'angellist.com',
      'hired.com',
      'jobs.stackoverflow.com',
      'stackoverflow.email',
      'remoteok.io',
      'weworkremotely.com',
      'flexjobs.com',
      'themuse.com',
      'idealist.org',
      'usajobs.gov',
      'simplyhired.com',
      'snagajob.com',
      'jobs.github.com',
      'builtin.com',
      'venturebeat.com'
    ];

    // Subject line patterns that indicate digests/newsletters
    this.digestSubjectPatterns = [
      // Job recommendations
      /jobs? for you/i,
      /recommended jobs?/i,
      /jobs? you might like/i,
      /jobs? that match/i,
      /new jobs? matching/i,
      /jobs? based on your/i,
      /similar jobs?/i,
      /jobs? alert/i,
      /job digest/i,
      /weekly jobs?/i,
      /daily jobs?/i,
      /jobs? newsletter/i,
      /jobs? roundup/i,
      /latest jobs?/i,
      /new opportunities/i,
      /career opportunities/i,
      
      // Newsletter patterns
      /newsletter/i,
      /weekly digest/i,
      /daily digest/i,
      /monthly digest/i,
      /career insights/i,
      /career tips/i,
      /job search tips/i,
      
      // Marketing/promotional
      /unlock your potential/i,
      /boost your career/i,
      /stand out to employers/i,
      /employers are looking/i,
      /companies are hiring/i,
      /\d+ companies viewing/i,
      /profile views/i,
      
      // Specific LinkedIn patterns
      /people are viewing your profile/i,
      /you appeared in \d+ searches/i,
      /job alert:/i,
      /connections? at/i,
      
      // Indeed/Glassdoor patterns
      /new jobs? in/i,
      /jobs? near you/i,
      /salary insights/i,
      /company reviews/i
    ];

    // Body content patterns that indicate digests
    this.digestBodyPatterns = [
      /view all jobs?/i,
      /see more jobs?/i,
      /browse more/i,
      /explore opportunities/i,
      /unsubscribe from (job |these )?alerts?/i,
      /manage your job alerts?/i,
      /job recommendations based on/i,
      /we found \d+ jobs?/i,
      /here are some jobs?/i,
      /check out these/i,
      /top picks for you/i,
      /curated for you/i,
      /personalized recommendations/i
    ];

    // Patterns that indicate actual job applications (whitelist)
    this.applicationPatterns = [
      /your application was sent/i,
      /application (was |has been )?sent to/i,
      /submitted your application/i,
      /applied for/i,
      /thank you for (your )?application/i,
      /we (have )?received your (application|resume)/i,
      /application (has been )?received/i,
      /application status/i,
      /schedule (an |your )?interview/i,
      /interview invitation/i,
      /offer letter/i,
      /job offer/i,
      /next steps? in (the |our )?process/i,
      /moving forward with your application/i,
      /start a conversation with/i,
      /new connection/i,
      /unfortunately/i,
      /regret to inform/i,
      /not selected/i,
      /position has been filled/i
    ];
  }

  /**
   * Check if email is a job digest/newsletter
   * @param {Object} email - Email object with subject, from, body
   * @returns {Object} - {is_digest: boolean, reason: string, confidence: number}
   */
  detectDigest(email) {
    const { subject = '', from = '', body = '' } = email;
    
    // First check if it's definitely an application email (whitelist)
    // This MUST be checked before domain filtering
    if (this.isApplicationEmail(subject, body)) {
      return {
        is_digest: false,
        reason: 'application_email',
        confidence: 1.0
      };
    }

    // Check sender domain - but only filter if no application signals
    const senderDomain = this.extractDomain(from);
    if (this.isDigestDomain(senderDomain)) {
      // IMPORTANT: Even from job board domains, check for application keywords
      // LinkedIn sends both digests AND real application confirmations
      if (this.hasApplicationSignals(subject, body)) {
        return {
          is_digest: false,
          reason: 'application_email_from_job_board',
          confidence: 1.0
        };
      }
      
      // Only filter as digest if NO application signals found
      return {
        is_digest: true,
        reason: `digest_domain:${senderDomain}`,
        confidence: 0.95
      };
    }

    // Check subject patterns
    for (const pattern of this.digestSubjectPatterns) {
      if (pattern.test(subject)) {
        return {
          is_digest: true,
          reason: 'digest_subject_pattern',
          confidence: 0.9
        };
      }
    }

    // Check body patterns (only first 2000 chars for performance)
    const bodySnippet = body.substring(0, 2000);
    let bodyMatchCount = 0;
    for (const pattern of this.digestBodyPatterns) {
      if (pattern.test(bodySnippet)) {
        bodyMatchCount++;
      }
    }

    // If multiple body patterns match, it's likely a digest
    if (bodyMatchCount >= 2) {
      return {
        is_digest: true,
        reason: 'digest_body_patterns',
        confidence: 0.85
      };
    }

    // Not detected as digest
    return {
      is_digest: false,
      reason: 'no_digest_signals',
      confidence: 0.0
    };
  }

  /**
   * Check if email is definitely an application email
   */
  isApplicationEmail(subject, body) {
    const content = `${subject} ${body.substring(0, 1000)}`.toLowerCase();
    
    for (const pattern of this.applicationPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if email has application-related signals
   */
  hasApplicationSignals(subject, body) {
    // Check for specific company application systems
    const applicationSystems = [
      /greenhouse/i,
      /lever/i,
      /workday/i,
      /taleo/i,
      /icims/i,
      /jobvite/i,
      /bamboohr/i,
      /smartrecruiters/i,
      /ashbyhq/i
    ];

    const content = `${subject} ${body.substring(0, 500)}`.toLowerCase();
    
    // Check for application system mentions
    for (const pattern of applicationSystems) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // Check for application keywords
    return this.isApplicationEmail(subject, body);
  }

  /**
   * Extract domain from email address
   */
  extractDomain(emailAddress) {
    const match = emailAddress.match(/@([^>]+)/);
    if (match) {
      return match[1].toLowerCase().trim();
    }
    return '';
  }

  /**
   * Check if domain is a known digest/newsletter source
   */
  isDigestDomain(domain) {
    if (!domain) return false;
    
    return this.digestDomains.some(digestDomain => {
      return domain === digestDomain || 
             domain.endsWith(`.${digestDomain}`) ||
             domain.includes(digestDomain.replace('.com', ''));
    });
  }

  /**
   * Get statistics for a batch of emails
   */
  getStatistics(emails) {
    const stats = {
      total: emails.length,
      digests: 0,
      applications: 0,
      unknown: 0,
      byReason: {}
    };

    for (const email of emails) {
      const result = this.detectDigest(email);
      
      if (result.is_digest) {
        stats.digests++;
      } else if (result.reason === 'application_email') {
        stats.applications++;
      } else {
        stats.unknown++;
      }

      // Track reasons
      stats.byReason[result.reason] = (stats.byReason[result.reason] || 0) + 1;
    }

    return stats;
  }
}

module.exports = DigestDetector;