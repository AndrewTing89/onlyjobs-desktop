/**
 * Digest Detector Module
 * 
 * Purpose: Pre-filters job digest/newsletter emails before ML classification
 * 
 * This module provides a lightweight, rule-based filter to identify and separate:
 * - Job recommendation digests and newsletters
 * - Bulk job alerts and marketing emails
 * - Profile view notifications and promotional content
 * 
 * From actual job application-related emails:
 * - Application confirmations and status updates
 * - Interview invitations and scheduling
 * - Offer letters and rejection notices
 * - Assessment and challenge invitations
 * 
 * The detector uses pattern matching and domain analysis to make quick decisions,
 * allowing genuine application emails to proceed to ML classification while
 * filtering out high-volume digest emails that would otherwise create noise.
 */

class DigestDetector {
  constructor() {
    // Job board and newsletter domains that ONLY send digests (no real applications)
    this.digestDomains = [
      // Job boards
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
      'venturebeat.com',
      'tldrnewsletter.com',  // TLDR newsletters
      'match.indeed.com',     // Indeed job recommendations
      
      // Newsletter platforms
      'substack.com',
      'beehiiv.com',
      'convertkit.com',
      'mailchimp.com',
      'sendgrid.net',
      'ccsend.com',
      'klaviyo.com',
      'getresponse.com',
      'constantcontact.com',
      
      // Specific job alert/notification addresses
      'jobalerts-noreply@linkedin.com',
      'messages-noreply@linkedin.com',
      'notifications-noreply@linkedin.com',
      'donotreply@match.indeed.com'
    ];
    
    // Domains that need special handling - they send both digests and real applications
    // For these, we'll rely on content patterns rather than domain filtering
    this.mixedDomains = [
      'linkedin.com',
      'indeed.com',
      'glassdoor.com'
    ];

    // Subject line patterns that indicate digests/newsletters
    this.digestSubjectPatterns = [
      // Job recommendations - patterns that indicate bulk job listings
      /^\d+ (new )?jobs?/i,  // Starts with a number of jobs
      /new jobs(?! (at|with) (the|my|our|your))/i,  // "new jobs" but not "new jobs at the company"
      /and \d+ more (new )?jobs?/i,  // Indeed pattern: "and X more new jobs"
      /new positions/i,
      /new openings/i,
      /available positions/i,
      /open positions/i,
      /job openings/i,
      /recommended jobs?/i,
      /jobs? (you might|you may) (like|be interested)/i,
      /jobs? that match/i,
      /jobs? matching your/i,
      /jobs? based on your/i,
      /similar jobs?/i,
      /jobs? alerts?/i,  // job alert or job alerts (more flexible)
      /job digest/i,
      /weekly jobs?/i,
      /daily jobs?/i,
      /jobs? newsletter/i,
      /jobs? roundup/i,
      /latest jobs?/i,
      /(new|available) opportunities/i,
      /career opportunities/i,
      
      // Newsletter patterns
      /newsletter/i,
      /weekly digest/i,
      /daily digest/i,
      /monthly digest/i,
      /career insights?/i,
      /career (tips|advice|growth|hacks)/i,
      /job search (tips|advice|strategies)/i,
      /\d+x (career|growth|results)/i,  // "10x career growth"
      /salary negotiation/i,
      /secret art of/i,
      /this blew up/i,
      /what (this|it) means for you/i,
      /f\*\*k.?ed up/i,  // Newsletter clickbait
      /leaked.+interview question/i,  // Interview prep newsletters
      
      // Marketing/promotional patterns
      /unlock your/i,
      /boost your/i,
      /stand out to/i,
      /don.?t miss (this|out)/i,
      /last chance/i,
      /limited time/i,
      /register (now|today) for/i,
      /employers are (looking|searching)/i,
      /(companies|.+) (are|is) hiring/i,  // "X companies are hiring" or "Company X is hiring"
      /is looking for/i,  // "Company X is looking for..."
      /is growing their team/i,
      /join (our|their) team/i,
      /hired roles near you/i,
      /companies? hired (for |roles)/i,
      /still looking for/i,
      /\d+ companies/i,  // "X companies viewing/interested"
      /profile views?/i,
      /who.?s viewed your/i,
      
      // Profile/search visibility patterns
      /people are viewing/i,
      /you appeared in \d+ search/i,
      /your profile appeared/i,
      /profile.?views?/i,
      /job alert:/i,
      /connections? at/i,
      
      // Social notification patterns
      /added \d+ comments?/i,
      /commented on your/i,
      /(others|and) have (added|made) .+ comments?/i,
      
      // Location-based job patterns
      /new jobs? in/i,
      /jobs? near/i,
      /jobs? within \d+ miles/i,
      
      // Information/review patterns  
      /salary insights?/i,
      /company reviews?/i,
      /employer ratings?/i,
      
      // Educational/webinar patterns
      /join us for .+ webinar/i,
      /admissions (webinar|event)/i,
      /become an? instructor/i,
      
      // Common digest patterns for job boards
      /^".+":.+-/i,  // Quoted job titles followed by company
      /^".+" at .+, .+, and /i,  // "Analyst" at Company1, Company2, and Company3
      /apply now to .+ at/i,  // "apply now to X at Company" prompts
      /^apply now to/i,  // Direct application prompts
      /see jobs at/i,  // "See jobs at Company X"
      /explore opportunities at/i,
      /check out (these |the )?jobs/i,
      /view jobs at/i,
      /\d+ more new jobs?/i,  // "1 more new job" or "3 more new jobs" from Indeed
      /you have an? invitation/i,
      /invitation (from|to connect)/i
    ];

    // Body content patterns that indicate digests
    this.digestBodyPatterns = [
      // Bulk job listing indicators
      /view all jobs?/i,
      /see more jobs?/i,
      /browse (more|all)/i,
      /explore (opportunities|jobs)/i,
      /view \d+ (more|similar)/i,
      
      // Newsletter/alert management
      /unsubscribe from/i,
      /manage (your )?(job |email )?alerts?/i,
      /update your preferences/i,
      /email preferences/i,
      
      // Recommendation language
      /(job )?recommendations based on/i,
      /we found \d+ (jobs?|opportunities)/i,
      /here are (some |the )?(latest |new )?jobs?/i,
      /check out these/i,
      /top picks for/i,
      /curated (for you|based on)/i,
      /personalized (recommendations|jobs)/i,
      /matches your (profile|skills|experience)/i,
      
      // Call-to-action for browsing
      /visit our (website|job board)/i,
      /search for more/i,
      /discover more opportunities/i,
      
      // Newsletter footer patterns
      /unsubscribe from (this |these )?(newsletter|updates)/i,
      /manage your (subscription|preferences)/i,
      /sent (via|using|by) (substack|beehiiv|convertkit)/i,
      /view (this )?(email )?in (your )?browser/i,
      /forward this (email|newsletter)/i,
      /why did (I|you) (get|receive) this/i
    ];

    // Patterns that indicate actual job applications (whitelist)
    this.applicationPatterns = [
      // Application submission confirmations
      /your application (was |has been )?sent/i,
      /application (was |has been )?(sent|submitted|received)/i,
      /thank you for (your )?application/i,
      /thank you for applying/i,
      /thank you for your interest/i,
      /we (have )?received your (application|resume|submission)/i,
      /successfully applied/i,
      /application (is |has been )?complete/i,
      
      // Application status updates
      /application status/i,
      /status of your application/i,
      /your application to/i,
      /application was (viewed|reviewed)/i,
      /application updates?/i,
      /reviewed your (application|resume|profile)/i,
      /regarding your application/i,
      /about your application/i,
      
      // Interview-related (but not "Interviews Chat" or similar discussion patterns)
      /schedule.{0,20}interview/i,
      /interview (invitation|request|confirmation)/i,
      /(?<!interviews )interview with/i,  // "interview with" but not "interviews interview with"
      /interviewing for/i,
      /invite you to interview/i,
      /confirm your interview/i,
      /\byour interview\b/i,
      /\bphone interview\b/i,
      /\btechnical interview\b/i,
      /\bfinal interview\b/i,
      
      // Offers and next steps
      /offer letter/i,
      /job offer/i,
      /employment offer/i,
      /next steps/i,
      /moving forward with/i,
      /proceed with your/i,
      /advanced to the next/i,
      
      // Assessments and challenges
      /assessment/i,
      /coding challenge/i,
      /technical (assessment|challenge|test)/i,
      /take.?home/i,
      /complete the.{0,20}(assessment|test|challenge)/i,
      
      // Rejections (still application-related)
      /unfortunately/i,
      /regret to inform/i,
      /(not|won.?t) (be )?(selected|moving forward|proceeding)/i,
      /position has been filled/i,
      /no longer (available|hiring)/i,
      /decided to (move|go|proceed)/i,
      /other candidate/i
    ];
  }

  /**
   * Check if email is a job digest/newsletter
   * @param {Object} email - Email object with subject, from, body
   * @returns {Object} - {is_digest: boolean, reason: string, confidence: number}
   */
  detectDigest(email) {
    const { subject = '', from = '', body = '' } = email;
    
    // Special check for LinkedIn notifications-noreply - these are NEVER job applications
    if (from.includes('notifications-noreply@linkedin.com')) {
      return {
        is_digest: true,
        reason: 'digest_domain:notifications-noreply@linkedin.com',
        confidence: 0.99
      };
    }
    
    // Special check for Indeed job recommendations - these are ALWAYS digests
    if (from.includes('donotreply@match.indeed.com')) {
      return {
        is_digest: true,
        reason: 'digest_domain:donotreply@match.indeed.com',
        confidence: 0.99
      };
    }
    
    // First check if it's definitely an application email (whitelist)
    // This MUST be checked before domain filtering
    if (this.isApplicationEmail(subject, body)) {
      return {
        is_digest: false,
        reason: 'application_email',
        confidence: 1.0
      };
    }
    
    // Quick subject check for obvious application-related emails
    // These should NEVER be filtered as digests regardless of sender
    const subjectLower = subject.toLowerCase();
    const neverFilterPatterns = [
      'your application',
      'application to',
      'application was',
      'application has',
      'application status',
      'application update',
      'interview',
      'offer letter',
      'thank you for applying',
      'thank you for your interest',
      'we received your',
      'we have received',
      'regarding your application',
      'next steps',
      'assessment',
      'coding challenge',
      'technical assessment',
      'take-home',
      'background check',
      'reference check'
    ];
    
    for (const phrase of neverFilterPatterns) {
      if (subjectLower.includes(phrase)) {
        return {
          is_digest: false,
          reason: 'application_keyword_in_subject',
          confidence: 1.0
        };
      }
    }

    // Check sender domain
    const senderDomain = this.extractDomain(from);
    
    // Check if it's from a newsletter platform
    if (this.isNewsletterPlatform(senderDomain)) {
      // Newsletter platforms are almost always digests
      // But still check for application signals just in case
      if (!this.hasApplicationSignals(subject, body)) {
        return {
          is_digest: true,
          reason: 'newsletter_platform',
          confidence: 0.95
        };
      }
    }
    
    // Handle mixed domains (LinkedIn, Indeed, Glassdoor) - they send both types
    if (this.isMixedDomain(senderDomain)) {
      // For mixed domains, rely entirely on content patterns
      // Check for digest patterns in subject
      for (const pattern of this.digestSubjectPatterns) {
        if (pattern.test(subject)) {
          // Even with digest pattern, double-check it's not an application
          if (!this.hasApplicationSignals(subject, body)) {
            return {
              is_digest: true,
              reason: 'mixed_domain_digest_pattern',
              confidence: 0.85
            };
          }
        }
      }
      // If no digest patterns found, let it through for ML classification
    }
    
    // Handle pure digest domains (definitely only send newsletters)
    if (this.isDigestDomain(senderDomain)) {
      // These domains ONLY send digests, so filter them out
      // But still check for application signals just in case
      if (this.hasApplicationSignals(subject, body)) {
        return {
          is_digest: false,
          reason: 'application_email_from_job_board',
          confidence: 1.0
        };
      }
      
      // Pure digest domain with no application signals = definitely a digest
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
    // First check subject alone for strong signals
    const subjectLower = subject.toLowerCase();
    
    // Very strong subject indicators that should always pass
    const strongSubjectPatterns = [
      /your application/i,
      /application (to|for|at)/i,
      /application was/i,
      /application has been/i,
      /thank you for (your )?(application|applying|interest)/i,
      /regarding your (application|candidacy)/i,
      /interview/i,
      /(job |employment )?offer/i,
      /next steps/i,
      /assessment/i,
      /coding challenge/i
    ];
    
    for (const pattern of strongSubjectPatterns) {
      if (pattern.test(subjectLower)) {
        return true;
      }
    }
    
    // Then check subject + body for other patterns
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
    // Check for specific company application systems (ATS)
    const applicationSystems = [
      /greenhouse/i,
      /lever/i,
      /workday/i,
      /taleo/i,
      /icims/i,
      /jobvite/i,
      /bamboohr/i,
      /smartrecruiters/i,
      /ashbyhq/i,
      /breezy/i,
      /bullhorn/i,
      /recruitee/i,
      /jazz/i,
      /applicantpro/i,
      /zoho recruit/i
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
    // First check for full email addresses in the digestDomains list
    const emailMatch = emailAddress.match(/<([^>]+)>|([^<>\s]+@[^<>\s]+)/);
    if (emailMatch) {
      const fullEmail = (emailMatch[1] || emailMatch[2]).toLowerCase().trim();
      // Check if the full email address is in digestDomains
      if (this.digestDomains.includes(fullEmail)) {
        return fullEmail;
      }
    }
    
    // Otherwise extract just the domain
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
   * Check if domain sends both digests and real applications
   */
  isMixedDomain(domain) {
    if (!domain) return false;
    
    return this.mixedDomains.some(mixedDomain => {
      return domain === mixedDomain || 
             domain.endsWith(`.${mixedDomain}`) ||
             domain.includes(mixedDomain.replace('.com', ''));
    });
  }
  
  /**
   * Check if domain is a newsletter platform
   */
  isNewsletterPlatform(domain) {
    if (!domain) return false;
    
    const newsletterPlatforms = [
      'substack.com', 'beehiiv.com', 'convertkit.com',
      'mailchimp.com', 'sendgrid.net', 'ccsend.com',
      'klaviyo.com', 'getresponse.com', 'constantcontact.com'
    ];
    
    return newsletterPlatforms.some(platform => {
      return domain.includes(platform);
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