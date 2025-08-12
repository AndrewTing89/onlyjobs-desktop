/**
 * Re-normalization script for existing job records
 * Re-runs normalization on all existing jobs using stored email metadata
 * 
 * Usage:
 *   npm run llm:normalize -- --dry-run --db="/path/to/jobs.db"    # Preview changes
 *   ONLYJOBS_DB_PATH="/path/to/jobs.db" npm run llm:normalize     # Use env var
 *   npm run llm:normalize                                         # Auto-detect
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');

// Parse --db flag
let cliDbPath = null;
const dbFlagIndex = args.findIndex(arg => arg.startsWith('--db'));
if (dbFlagIndex !== -1) {
  const dbArg = args[dbFlagIndex];
  if (dbArg.includes('=')) {
    cliDbPath = dbArg.split('=')[1];
  } else if (dbFlagIndex + 1 < args.length) {
    cliDbPath = args[dbFlagIndex + 1];
  }
}

console.log(`🔧 ${isDryRun ? 'DRY RUN: ' : ''}Re-normalizing existing job records...`);

function resolveDbPath() {
  const homedir = os.homedir();
  const platform = os.platform();
  
  // 1. CLI flag (highest precedence)
  if (cliDbPath) {
    console.log(`📁 Using CLI --db path: ${cliDbPath}`);
    return cliDbPath;
  }
  
  // 2. Environment variable (2nd precedence)
  if (process.env.ONLYJOBS_DB_PATH) {
    console.log(`📁 Using env ONLYJOBS_DB_PATH: ${process.env.ONLYJOBS_DB_PATH}`);
    return process.env.ONLYJOBS_DB_PATH;
  }
  
  // 3. Platform-specific userData paths (3rd precedence)
  let userDataPaths = [];
  if (platform === 'darwin') {
    userDataPaths.push(path.join(homedir, 'Library', 'Application Support', 'onlyjobs-desktop', 'jobs.db'));
  } else if (platform === 'win32') {
    if (process.env.APPDATA) {
      userDataPaths.push(path.join(process.env.APPDATA, 'onlyjobs-desktop', 'jobs.db'));
    }
  } else { // Linux and others
    userDataPaths.push(path.join(homedir, '.config', 'onlyjobs-desktop', 'jobs.db'));
  }
  
  // 4. Repo-local fallbacks (lowest precedence)
  const repoLocalPaths = [
    path.join(process.cwd(), 'jobs.db'),
    path.join(process.cwd(), 'data', 'jobs.db'),
    path.join(process.cwd(), 'electron', 'jobs.db'),
    path.join(homedir, '.onlyjobs', 'jobs.db')
  ];
  
  const allPaths = [...userDataPaths, ...repoLocalPaths];
  
  // Try each path in order
  for (const dbPath of allPaths) {
    if (fs.existsSync(dbPath)) {
      console.log(`📁 Found database: ${dbPath}`);
      return dbPath;
    }
  }
  
  // Build helpful error message
  const pathMessages = [];
  if (cliDbPath) pathMessages.push(`CLI --db: ${cliDbPath} (provided but not found)`);
  if (process.env.ONLYJOBS_DB_PATH) pathMessages.push(`env ONLYJOBS_DB_PATH: ${process.env.ONLYJOBS_DB_PATH} (provided but not found)`);
  pathMessages.push('Candidate paths searched:');
  allPaths.forEach(p => pathMessages.push(`  - ${p}`));
  
  throw new Error(`Could not find jobs.db database file.\\n\\n${pathMessages.join('\\n')}\\n\\nHint: Close the Electron app first if it's running, or use --db flag to specify the exact path.`);
}

function detectEmailSchema(db) {
  try {
    // Get column info for emails table
    const columns = db.prepare('PRAGMA table_info(emails)').all();
    const columnNames = columns.map(col => col.name.toLowerCase());
    
    // Detect subject column
    const subjectCol = ['subject', 'subject_line'].find(name => columnNames.includes(name)) || null;
    
    // Detect from column
    const fromCol = ['from_address', 'from', 'sender'].find(name => columnNames.includes(name)) || null;
    
    // Detect body column
    const bodyCol = ['raw_content', 'content', 'plaintext', 'body', 'text', 'plaintext_content'].find(name => columnNames.includes(name)) || null;
    
    console.log(`📋 Email schema detected:`);
    console.log(`   Subject: ${subjectCol || 'NOT FOUND'}`);
    console.log(`   From: ${fromCol || 'NOT FOUND'}`);
    console.log(`   Body: ${bodyCol || 'NOT FOUND'}`);
    
    return {
      subjectCol: subjectCol || 'NULL',
      fromCol: fromCol || 'NULL', 
      bodyCol: bodyCol || 'NULL'
    };
  } catch (error) {
    console.warn('⚠️ Could not detect email schema, using defaults');
    return {
      subjectCol: 'subject',
      fromCol: 'from_address', 
      bodyCol: 'raw_content'
    };
  }
}

function buildDynamicQuery(schema) {
  // Build SELECT with proper NULL handling for missing columns
  const subjectSelect = schema.subjectCol === 'NULL' ? 'NULL AS subject' : `e.${schema.subjectCol} AS subject`;
  const fromSelect = schema.fromCol === 'NULL' ? 'NULL AS from_address' : `e.${schema.fromCol} AS from_address`;
  const bodySelect = schema.bodyCol === 'NULL' ? 'NULL AS raw_content' : `e.${schema.bodyCol} AS raw_content`;
  
  return `
    SELECT 
      j.id              AS job_id,
      j.email_id        AS email_id,
      j.company         AS company,
      j.position        AS position,
      j.status          AS status,
      j.ml_confidence   AS confidence,
      ${subjectSelect},
      ${fromSelect},
      ${bodySelect}
    FROM jobs j
    LEFT JOIN emails e ON e.id = j.email_id
    WHERE j.id IS NOT NULL
    ORDER BY j.created_at DESC
  `;
}

async function normalizeExistingRecords() {
  const dbPath = resolveDbPath();
  
  // Open database (read-only for dry run)
  const db = Database(dbPath, { 
    readonly: isDryRun,
    fileMustExist: true 
  });
  
  try {
    // Import normalization functions
    const { normalizeEmailClassification } = require('../electron/classifier/normalize.runtime.js');
    
    console.log('📊 Analyzing existing records...');
    
    // Detect email schema
    const schema = detectEmailSchema(db);
    
    // Build dynamic query
    const query = buildDynamicQuery(schema);
    console.log(`🔍 Using query with schema: subject=${schema.subjectCol}, from=${schema.fromCol}, body=${schema.bodyCol}`);
    
    // Get all jobs with email metadata
    const jobs = db.prepare(query).all();
    
    console.log(`📋 Found ${jobs.length} job records`);
    
    if (jobs.length === 0) {
      console.log('ℹ️  No job records found in database');
      return;
    }
    
    // Log first job for debugging
    if (verbose && jobs.length > 0) {
      const firstJob = jobs[0];
      console.log(`🔍 First job raw_content length: ${firstJob.raw_content ? firstJob.raw_content.length : 'null'}`);
      console.log(`🔍 First job subject: "${firstJob.subject || 'null'}"`);
      console.log(`🔍 First job from: "${firstJob.from_address || 'null'}"`);
    }
    
    let changed = 0;
    let skipped = 0;
    let errors = 0;
    const examples = [];
    const changesSummary = {
      company: 0,
      position: 0,
      status: 0,
      confidence: 0
    };
    
    // Begin transaction for writes (if not dry run)
    const transaction = isDryRun ? null : db.transaction(() => {
      // Transaction will be populated below
    });
    
    // Process each job
    for (const job of jobs) {
      try {
        // Skip if no email metadata
        if (!job.subject && !job.raw_content) {
          skipped++;
          if (verbose) console.log(`⚠️ Skipping job ${job.job_id}: no email metadata`);
          continue;
        }
        
        // Infer is_job_related from status (jobs table likely doesn't store this)
        const isJobRelated = Boolean(job.status && ['Applied', 'Interview', 'Declined', 'Offer'].includes(job.status));
        
        // Prepare current classification
        const currentResult = {
          is_job_related: isJobRelated,
          company: job.company,
          position: job.position,
          status: job.status,
          confidence: job.confidence || 0.5
        };
        
        // Prepare email data
        const emailData = {
          subject: job.subject,
          plaintext: job.raw_content,
          from_address: job.from_address
        };
        
        // Apply normalization
        const result = normalizeEmailClassification(emailData, currentResult);
        const normalized = result.normalized;
        
        // Check for changes
        const hasChanges = 
          normalized.company !== job.company ||
          normalized.position !== job.position ||
          normalized.status !== job.status ||
          Math.abs((normalized.confidence || 0.5) - (job.confidence || 0.5)) > 0.01;
        
        if (hasChanges) {
          changed++;
          
          // Track change types
          if (normalized.company !== job.company) changesSummary.company++;
          if (normalized.position !== job.position) changesSummary.position++;
          if (normalized.status !== job.status) changesSummary.status++;
          if (Math.abs((normalized.confidence || 0.5) - (job.confidence || 0.5)) > 0.01) changesSummary.confidence++;
          
          // Collect examples
          if (examples.length < 5) {
            examples.push({
              id: job.job_id,
              subject: job.subject,
              before: {
                company: job.company,
                position: job.position,
                status: job.status,
                confidence: job.confidence
              },
              after: {
                company: normalized.company,
                position: normalized.position,
                status: normalized.status,
                confidence: normalized.confidence
              },
              notes: result.notes,
              decisionPathSuffix: result.decisionPathSuffix
            });
          }
          
          // Log change
          const changes = [];
          if (normalized.company !== job.company) changes.push(`company:"${job.company}"→"${normalized.company}"`);
          if (normalized.position !== job.position) changes.push(`position:"${job.position}"→"${normalized.position}"`);
          if (normalized.status !== job.status) changes.push(`status:"${job.status}"→"${normalized.status}"`);
          if (Math.abs((normalized.confidence || 0.5) - (job.confidence || 0.5)) > 0.01) {
            changes.push(`confidence:${job.confidence}→${normalized.confidence}`);
          }
          
          console.log(`${isDryRun ? '[DRY RUN] ' : ''}job_id=${job.job_id} changes: ${changes.join(', ')}${result.notes.length > 0 ? ` [rules: ${result.notes.join(', ')}]` : ''}`);
          
          // Apply changes if not dry run
          if (!isDryRun) {
            // Handle database constraints
            const safeCompany = normalized.company || job.company || 'Unknown Company';
            const safePosition = normalized.position || job.position || 'Unknown Position';
            
            // Map normalized status to database-valid values
            let safeStatus = job.status; // Keep original by default
            if (normalized.status && normalized.status !== job.status) {
              const statusMapping = {
                'Applied': 'applied',
                'Interview': 'interviewing', 
                'Declined': 'rejected',
                'Offer': 'offered'
              };
              safeStatus = statusMapping[normalized.status] || job.status;
            }
            
            // Skip updates that would violate constraints
            const wouldFailConstraints = 
              (!safeCompany) || 
              (!safePosition) || 
              (!['active', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'].includes(safeStatus));
            
            if (wouldFailConstraints) {
              console.warn(`⚠️ Skipping job ${job.job_id}: would violate database constraints`);
            } else {
              const updateStmt = db.prepare(`
                UPDATE jobs 
                SET company = ?, position = ?, status = ?, ml_confidence = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
              `);
              
              updateStmt.run(
                safeCompany,
                safePosition, 
                safeStatus,
                normalized.confidence,
                job.job_id
              );
            }
          }
        }
        
      } catch (error) {
        errors++;
        console.error(`❌ Error processing job ${job.job_id}:`, error.message);
        if (verbose) {
          console.error(error.stack);
        }
      }
    }
    
    // Commit transaction if not dry run
    if (!isDryRun && transaction) {
      // Transaction was not used above - updates were done directly
      // This is fine for SQLite autocommit mode
    }
    
    // Print summary
    console.log('\\n📈 NORMALIZATION SUMMARY');
    console.log('=' .repeat(50));
    console.log(`📊 Total jobs processed: ${jobs.length}`);
    console.log(`✏️ Jobs ${isDryRun ? 'that would be ' : ''}changed: ${changed}`);
    console.log(`⏭️  Jobs skipped (no email data): ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`\\n🔧 Changes by field:`);
    console.log(`   Company: ${changesSummary.company}`);
    console.log(`   Position: ${changesSummary.position}`);
    console.log(`   Status: ${changesSummary.status}`);
    console.log(`   Confidence: ${changesSummary.confidence}`);
    
    // Show examples
    if (examples.length > 0) {
      console.log('\\n🎯 Example changes:');
      examples.forEach((example, i) => {
        console.log(`\\n${i + 1}. Subject: "${example.subject || 'null'}"`);
        console.log(`   Company: "${example.before.company}" → "${example.after.company}"`);
        console.log(`   Position: "${example.before.position}" → "${example.after.position}"`);
        console.log(`   Status: "${example.before.status}" → "${example.after.status}"`);
        if (example.notes && example.notes.length > 0) {
          console.log(`   Applied: ${example.notes.join(', ')}`);
        }
        if (example.decisionPathSuffix) {
          console.log(`   Decision: ${example.decisionPathSuffix}`);
        }
      });
    }
    
    if (isDryRun) {
      console.log('\\n💡 Run without --dry-run to apply these changes');
    } else if (changed > 0) {
      console.log('\\n✅ Normalization completed successfully!');
    } else {
      console.log('\\n✅ No changes needed - all records already normalized');
    }
    
  } catch (error) {
    if (error.code === 'SQLITE_BUSY') {
      throw new Error('Database is locked. Close the Electron app first and try again.');
    }
    throw error;
  } finally {
    db.close();
  }
}

async function main() {
  try {
    await normalizeExistingRecords();
    process.exit(0);
  } catch (error) {
    console.error('❌ Normalization failed:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch(console.error);