/**
 * Thread-Aware Email Processor
 * Efficiently processes job emails using Gmail threads and smart matching
 * 
 * CRITICAL IMPROVEMENTS (Fixed):
 * 1. Groups orphan emails by EXTRACTED company name, not email domain
 *    - Prevents catastrophic grouping of all greenhouse.io emails together
 *    - Uses Stage 2 company extraction for accurate grouping
 * 2. Detects hiring platforms (greenhouse, lever, workday, etc.)
 *    - Trusts extracted company name over domain for these platforms
 * 3. Normalizes company names for better matching
 *    - Removes Inc., LLC, Ltd., etc. suffixes
 *    - Ensures "Google Inc" matches "Google"
 */

class ThreadAwareProcessor {
  constructor(mainWindow = null) {
    const { getClassifierProvider } = require('./classifier');
    this.classifier = getClassifierProvider();
    this.twoStage = require('./llm/two-stage-classifier');
    this.mainWindow = mainWindow;
  }

  /**
   * Main processing function - handles emails with thread awareness
   */
  async processEmails(emails, account, modelId = 'llama-3-8b-instruct-q5_k_m', isCancelled = null) {
    console.log(`Processing ${emails.length} emails for ${account.email}`);
    
    // Step 1: Group emails by thread
    const { threads, orphans } = this.groupByThread(emails);
    
    console.log(`Found ${threads.size} email threads and ${orphans.length} orphan emails`);
    
    // Step 2: Process threaded emails (most efficient path)
    const threadJobs = await this.processThreads(threads, account, modelId, isCancelled);
    
    // Step 3: Process orphan emails with smart matching
    const orphanJobs = await this.processOrphans(orphans, account, modelId, isCancelled);
    
    // Step 4: Merge results
    const allJobs = [...threadJobs, ...orphanJobs];
    
    console.log(`Processed into ${allJobs.length} unique jobs`);
    
    return {
      jobs: allJobs,
      stats: {
        totalEmails: emails.length,
        threads: threads.size,
        orphans: orphans.length,
        jobsFound: allJobs.length
      }
    };
  }

  /**
   * Group emails by thread ID
   */
  groupByThread(emails) {
    const threads = new Map();
    const orphans = [];
    
    for (const email of emails) {
      if (email.threadId) {
        if (!threads.has(email.threadId)) {
          threads.set(email.threadId, []);
        }
        threads.get(email.threadId).push(email);
      } else {
        orphans.push(email);
      }
    }
    
    return { threads, orphans };
  }

  /**
   * Process email threads efficiently with batching to prevent sequence exhaustion
   */
  async processThreads(threads, account, modelId, isCancelled = null) {
    const jobs = [];
    const BATCH_SIZE = 3; // Reduced from 5 to 3 to prevent context exhaustion
    
    // Convert Map to Array for easier batching
    const threadEntries = Array.from(threads.entries());
    console.log(`📦 Processing ${threadEntries.length} threads in batches of ${BATCH_SIZE}`);
    
    // Send initial thread processing event
    if (this.mainWindow) {
      this.mainWindow.webContents.send('sync-progress', {
        stage: `Starting thread processing: ${threadEntries.length} threads`,
        phase: 'classifying',
        details: { 
          totalThreads: threadEntries.length,
          threadsProcessed: 0,
          batch: { current: 0, total: Math.ceil(threadEntries.length / BATCH_SIZE) }
        },
        progress: 0
      });
    }
    
    // Process threads in batches
    for (let i = 0; i < threadEntries.length; i += BATCH_SIZE) {
      const batch = threadEntries.slice(i, Math.min(i + BATCH_SIZE, threadEntries.length));
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(threadEntries.length / BATCH_SIZE);
      
      console.log(`\n🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} threads)`);
      
      // Check for cancellation
      if (isCancelled && isCancelled()) {
        console.log('🛑 Processing cancelled by user');
        break;
      }
      
      // Send batch start event with thread count
      if (this.mainWindow) {
        this.mainWindow.webContents.send('sync-progress', {
          stage: `Processing batch ${batchNumber}/${totalBatches}`,
          phase: 'classifying',
          details: { 
            batch: { current: batchNumber, total: totalBatches },
            totalThreads: threadEntries.length,
            threadsProcessed: i
          },
          progress: Math.round((i / threadEntries.length) * 100)
        });
      }
      
      // Process threads in this batch sequentially
      for (const [threadId, threadEmails] of batch) {
        // Sort emails chronologically (oldest first)
        threadEmails.sort((a, b) => {
          const dateA = parseInt(a.internalDate || 0);
          const dateB = parseInt(b.internalDate || 0);
          return dateA - dateB;
        });
        
        // Strategy: Use LAST email for classification (most current status)
        // but keep first email info for company/position clarity
        const firstEmail = threadEmails[0];
        const lastEmail = threadEmails[threadEmails.length - 1];
        
        // Build combined context: latest email + thread context
        const lastSubject = this.extractSubject(lastEmail);
        const lastBody = this.extractBody(lastEmail);
        const firstSubject = this.extractSubject(firstEmail);
        
        // Skip if no content
        if (!lastSubject && !lastBody) continue;
        
        // Create enhanced context for better classification
        let enhancedBody = lastBody;
        if (threadEmails.length > 1) {
          // Add context about this being part of a thread
          enhancedBody = `[This is email ${threadEmails.length} of ${threadEmails.length} in thread]\n` +
                        `[Original subject: ${firstSubject}]\n\n` +
                        lastBody;
        }
        
        try {
          // Classify the LAST email with thread context (Stage 1 & 2)
          const threadProgress = `${i + batch.indexOf([threadId, threadEmails]) + 1}/${threadEntries.length}`;
          console.log(`🔍 [${threadProgress}] Classifying thread ${threadId} (${threadEmails.length} emails)`);
          
          // Send classification progress event
          if (this.mainWindow) {
            const currentThreadIndex = i + batch.indexOf([threadId, threadEmails]);
            this.mainWindow.webContents.send('classify-progress', {
              type: 'classify',
              message: `Classifying thread ${threadId.substring(0, 8)}... (${threadEmails.length} emails)`,
              details: { 
                thread: threadId,
                threadsProcessed: currentThreadIndex,
                totalThreads: threadEntries.length
              }
            });
            
            // Also update sync-progress with thread count
            this.mainWindow.webContents.send('sync-progress', {
              stage: `Classifying thread ${currentThreadIndex + 1} of ${threadEntries.length}`,
              phase: 'classifying',
              details: {
                batch: { current: batchNumber, total: totalBatches },
                totalThreads: threadEntries.length,
                threadsProcessed: currentThreadIndex + 1
              },
              progress: Math.round(((currentThreadIndex + 1) / threadEntries.length) * 100)
            });
          }
          
          const classification = await this.classifier.parse({
            subject: lastSubject,
            plaintext: enhancedBody,
            modelId
          });
          
          if (classification.is_job_related) {
            // Send job found event
            if (this.mainWindow) {
              this.mainWindow.webContents.send('job-found', {
                company: classification.company || 'Unknown Company',
                position: classification.position || 'Unknown Position',
                status: classification.status || 'Applied'
              });
            }
            
            // All emails in thread belong to this job
            const job = {
              threadId,
              company: classification.company || 'Unknown Company',
              position: classification.position || 'Unknown Position',
              status: this.determineLatestStatus(threadEmails, classification),
              confidence: classification.confidence || 0.95,
              emails: threadEmails.map(e => ({
                id: e.id,
                date: new Date(parseInt(e.internalDate)),
                subject: this.extractSubject(e)
              })),
              firstEmailDate: new Date(parseInt(firstEmail.internalDate)),
              lastEmailDate: new Date(parseInt(threadEmails[threadEmails.length - 1].internalDate)),
              accountEmail: account.email
            };
            
            jobs.push(job);
            console.log(`✅ Found job: ${job.company} - ${job.position} (${job.status})`);
          } else {
            console.log(`⚪ Not job-related`);
            // Send skip event
            if (this.mainWindow) {
              this.mainWindow.webContents.send('classify-progress', {
                type: 'skip',
                message: `Thread ${threadId.substring(0, 8)}... not job-related`,
                details: { thread: threadId, result: 'not_job' }
              });
            }
          }
        } catch (error) {
          console.error(`❌ Error classifying thread ${threadId}:`, error.message);
        }
      }
      
      // Increased delay between batches to let system resources and context recover
      if (i + BATCH_SIZE < threadEntries.length) {
        console.log(`⏸️  Pausing before next batch to let resources recover...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Increased from 500ms to 1s
      }
    }
    
    console.log(`\n✅ Thread processing complete: ${jobs.length} jobs found from ${threadEntries.length} threads`);
    
    // Send completion event for thread processing
    if (this.mainWindow) {
      this.mainWindow.webContents.send('sync-progress', {
        stage: `Thread processing complete: ${jobs.length} jobs found`,
        phase: 'classifying',
        details: {
          totalThreads: threadEntries.length,
          threadsProcessed: threadEntries.length,
          jobsFound: jobs.length
        },
        progress: 100
      });
    }
    
    return jobs;
  }

  /**
   * Process orphan emails with company grouping and Stage 3 matching
   */
  async processOrphans(orphans, account, modelId, isCancelled = null) {
    if (orphans.length === 0) return [];
    
    // Send orphan processing event
    if (this.mainWindow && orphans.length > 0) {
      this.mainWindow.webContents.send('sync-progress', {
        stage: `Processing ${orphans.length} orphan emails`,
        phase: 'classifying',
        details: { 
          totalThreads: orphans.length,
          threadsProcessed: 0
        },
        progress: 0
      });
    }
    
    // First, classify all orphans to extract company names
    const classifiedOrphans = await this.classifyOrphans(orphans, modelId);
    
    // Group by extracted company name for efficient matching
    const companyGroups = this.groupByExtractedCompany(classifiedOrphans);
    const jobs = [];
    
    for (const [companyName, companyEmails] of companyGroups) {
      // Sort chronologically
      companyEmails.sort((a, b) => {
        const dateA = parseInt(a.email.internalDate || 0);
        const dateB = parseInt(b.email.internalDate || 0);
        return dateA - dateB;
      });
      
      // Group related jobs using Stage 3 matching
      if (companyEmails.length > 0) {
        const groupedJobs = await this.groupRelatedJobs(companyEmails, account, modelId);
        jobs.push(...groupedJobs);
      }
    }
    
    return jobs;
  }

  /**
   * Classify all orphan emails first (Stage 1 & 2) with batching
   */
  async classifyOrphans(orphans, modelId) {
    const classified = [];
    const BATCH_SIZE = 3; // Reduced from 5 to 3 to prevent context exhaustion
    
    if (orphans.length === 0) return classified;
    
    console.log(`📦 Processing ${orphans.length} orphan emails in batches of ${BATCH_SIZE}`);
    
    for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
      const batch = orphans.slice(i, Math.min(i + BATCH_SIZE, orphans.length));
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(orphans.length / BATCH_SIZE);
      
      console.log(`\n🔄 Processing orphan batch ${batchNumber}/${totalBatches} (${batch.length} emails)`);
      
      for (const email of batch) {
        const subject = this.extractSubject(email);
        const body = this.extractBody(email);
        
        if (!subject && !body) continue;
        
        try {
          const orphanIndex = i + batch.indexOf(email);
          const orphanProgress = `${orphanIndex + 1}/${orphans.length}`;
          console.log(`🔍 [${orphanProgress}] Classifying orphan email`);
          
          // Send progress for orphan classification
          if (this.mainWindow) {
            this.mainWindow.webContents.send('sync-progress', {
              stage: `Processing orphan ${orphanIndex + 1} of ${orphans.length}`,
              phase: 'classifying',
              details: {
                totalThreads: orphans.length,
                threadsProcessed: orphanIndex + 1
              },
              progress: Math.round(((orphanIndex + 1) / orphans.length) * 100)
            });
          }
          
          const classification = await this.classifier.parse({
            subject,
            plaintext: body,
            modelId
          });
          
          if (classification.is_job_related) {
            classified.push({ email, classification });
            console.log(`✅ Job-related: ${classification.company || 'Unknown'} - ${classification.position || 'Unknown'}`);
          } else {
            console.log(`⚪ Not job-related`);
            // Send skip event
            if (this.mainWindow) {
              this.mainWindow.webContents.send('classify-progress', {
                type: 'skip',
                message: `Thread ${threadId.substring(0, 8)}... not job-related`,
                details: { thread: threadId, result: 'not_job' }
              });
            }
          }
        } catch (error) {
          console.error(`❌ Error classifying orphan email ${email.id}:`, error.message);
        }
      }
      
      // Small delay between batches
      if (i + BATCH_SIZE < orphans.length) {
        console.log(`⏸️  Pausing briefly before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`\n✅ Orphan classification complete: ${classified.length} job-related emails found from ${orphans.length} orphans`);
    return classified;
  }
  
  /**
   * Group orphan emails by extracted company name (from Stage 2)
   */
  groupByExtractedCompany(classifiedEmails) {
    const groups = new Map();
    const hiringPlatforms = this.getHiringPlatforms();
    
    for (const { email, classification } of classifiedEmails) {
      // Use extracted company name, not email domain
      let companyKey = classification.company || 'Unknown Company';
      
      // Normalize company name for better grouping
      companyKey = this.normalizeCompanyName(companyKey);
      
      // Check if email is from a hiring platform
      const from = this.extractFrom(email);
      const domain = this.extractDomain(from);
      if (hiringPlatforms.has(domain)) {
        // For hiring platforms, trust the extracted company name even more
        console.log(`Email from hiring platform ${domain}, company: ${companyKey}`);
      }
      
      if (!groups.has(companyKey)) {
        groups.set(companyKey, []);
      }
      groups.get(companyKey).push({ email, classification });
    }
    
    return groups;
  }
  
  /**
   * Get list of known hiring platforms
   */
  getHiringPlatforms() {
    return new Set([
      'greenhouse.io',
      'lever.co',
      'workday.com',
      'taleo.net',
      'breezy.hr',
      'ashbyhq.com',
      'jobvite.com',
      'icims.com',
      'smartrecruiters.com',
      'myworkday.com',
      'ultipro.com',
      'successfactors.com',
      'bamboohr.com',
      'applytojob.com',
      'recruiterbox.com'
    ]);
  }
  
  /**
   * Normalize company names for better matching
   */
  normalizeCompanyName(company) {
    if (!company) return 'Unknown Company';
    
    // Convert to lowercase and trim
    let normalized = company.toLowerCase().trim();
    
    // Remove common suffixes (handles multiple variations)
    normalized = normalized
      .replace(/,?\s+(inc\.?|incorporated|llc\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company)$/i, '');
    
    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  /**
   * Use Stage 3 to group related jobs within same company
   */
  async groupRelatedJobs(classifiedEmails, account, modelId) {
    const jobs = [];
    const modelPath = `/Users/ndting/Library/Application Support/models/${modelId}.gguf`;
    
    for (const item of classifiedEmails) {
      let matched = false;
      
      // Try to match with existing jobs (already grouped by company)
      for (const job of jobs) {
        
        // Use Stage 3 for intelligent matching
        try {
          const matchResult = await this.twoStage.matchJobs(
            modelId,
            modelPath,
            {
              company: item.classification.company,
              position: item.classification.position,
              status: item.classification.status
            },
            {
              company: job.company,
              position: job.position,
              status: job.status
            }
          );
          
          if (matchResult.same_job) {
            // Add email to existing job
            job.emails.push({
              id: item.email.id,
              date: new Date(parseInt(item.email.internalDate)),
              subject: this.extractSubject(item.email)
            });
            
            // Update status if newer
            const emailDate = parseInt(item.email.internalDate);
            const lastDate = job.lastEmailDate.getTime();
            if (emailDate > lastDate) {
              job.lastEmailDate = new Date(emailDate);
              job.status = this.determineStatus(item.classification);
            }
            
            matched = true;
            break;
          }
        } catch (error) {
          console.error('Stage 3 matching error:', error);
        }
      }
      
      if (!matched) {
        // Create new job entry
        const emailDate = new Date(parseInt(item.email.internalDate));
        jobs.push({
          threadId: null, // No thread for orphans
          company: item.classification.company || 'Unknown Company',
          position: item.classification.position || 'Unknown Position',
          status: this.determineStatus(item.classification),
          confidence: item.classification.confidence || 0.8,
          emails: [{
            id: item.email.id,
            date: emailDate,
            subject: this.extractSubject(item.email)
          }],
          firstEmailDate: emailDate,
          lastEmailDate: emailDate,
          accountEmail: account.email
        });
      }
    }
    
    return jobs;
  }

  /**
   * Helper: Check if two company names might be the same
   */
  mightBeSameCompany(company1, company2) {
    if (!company1 || !company2) return false;
    
    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm1 = normalize(company1);
    const norm2 = normalize(company2);
    
    // Check if one contains the other
    return norm1.includes(norm2) || norm2.includes(norm1);
  }

  /**
   * Helper: Determine latest status from email thread
   */
  determineLatestStatus(emails, classification) {
    // Start with classification status
    let status = this.determineStatus(classification);
    
    // Check latest emails for status updates
    const latestEmails = emails.slice(-3); // Check last 3 emails
    for (const email of latestEmails) {
      const subject = this.extractSubject(email).toLowerCase();
      const body = this.extractBody(email).toLowerCase();
      const content = subject + ' ' + body;
      
      if (content.includes('offer') && content.includes('congratulations')) {
        status = 'Offer';
      } else if (content.includes('interview') || content.includes('schedule')) {
        if (status !== 'Offer') status = 'Interview';
      } else if (content.includes('reject') || content.includes('unfortunately')) {
        if (status !== 'Offer') status = 'Declined';
      }
    }
    
    return status;
  }

  /**
   * Helper: Determine status from classification
   */
  determineStatus(classification) {
    if (classification.status) {
      const statusLower = classification.status.toLowerCase();
      if (statusLower.includes('offer')) return 'Offer';
      if (statusLower.includes('interview')) return 'Interview';
      if (statusLower.includes('declin') || statusLower.includes('reject')) return 'Declined';
      if (statusLower.includes('appli')) return 'Applied';
    }
    return 'Applied';
  }

  /**
   * Helper: Extract subject from Gmail message
   */
  extractSubject(message) {
    if (!message.payload || !message.payload.headers) return '';
    
    const subjectHeader = message.payload.headers.find(
      h => h.name.toLowerCase() === 'subject'
    );
    
    return subjectHeader ? subjectHeader.value : '';
  }

  /**
   * Helper: Extract body from Gmail message
   */
  extractBody(message) {
    if (!message.payload) return '';
    
    const extractText = (part) => {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      
      if (part.parts) {
        for (const subPart of part.parts) {
          const text = extractText(subPart);
          if (text) return text;
        }
      }
      
      return '';
    };
    
    return extractText(message.payload);
  }

  /**
   * Helper: Extract from address
   */
  extractFrom(message) {
    if (!message.payload || !message.payload.headers) return '';
    
    const fromHeader = message.payload.headers.find(
      h => h.name.toLowerCase() === 'from'
    );
    
    return fromHeader ? fromHeader.value : '';
  }

  /**
   * Helper: Extract domain from email address
   */
  extractDomain(email) {
    const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match ? match[1].toLowerCase() : 'unknown';
  }
}

module.exports = ThreadAwareProcessor;