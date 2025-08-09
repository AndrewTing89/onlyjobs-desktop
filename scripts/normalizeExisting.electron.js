/**
 * Re-normalization script for existing job records
 * Re-runs normalization on all existing jobs using stored email metadata
 * 
 * Usage:
 *   npm run llm:normalize -- --dry-run    # Preview changes
 *   npm run llm:normalize                 # Apply changes
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Get CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');

console.log(`🔧 ${isDryRun ? 'DRY RUN: ' : ''}Re-normalizing existing job records...`);

async function findDatabase() {
  // Common database locations
  const possiblePaths = [
    path.join(process.cwd(), 'jobs.db'),
    path.join(process.cwd(), 'data', 'jobs.db'),
    path.join(process.cwd(), 'electron', 'jobs.db'),
    path.join(require('os').homedir(), '.onlyjobs', 'jobs.db')
  ];
  
  for (const dbPath of possiblePaths) {
    if (fs.existsSync(dbPath)) {
      console.log(`📁 Found database: ${dbPath}`);
      return dbPath;
    }
  }
  
  throw new Error('Could not find jobs.db database file. Possible locations: ' + possiblePaths.join(', '));
}

async function normalizeExistingRecords() {
  const dbPath = await findDatabase();
  const db = Database(dbPath);
  
  try {
    // Import normalization functions
    const { normalizeResult } = await import('../electron/classifier/normalize.js');
    
    console.log('📊 Analyzing existing records...');
    
    // Get all jobs with email metadata
    const jobs = db.prepare(`
      SELECT 
        j.id,
        j.company,
        j.position,
        j.status,
        j.ml_confidence,
        j.email_id,
        e.subject,
        e.from_address,
        e.content as raw_content,
        e.plaintext_content
      FROM jobs j
      LEFT JOIN emails e ON j.email_id = e.id
      WHERE j.id IS NOT NULL
      ORDER BY j.created_at DESC
    `).all();
    
    console.log(`📋 Found ${jobs.length} job records`);
    
    let changed = 0;
    let errors = 0;
    const examples = [];
    const changesSummary = {
      company: 0,
      position: 0,
      status: 0
    };
    
    // Process each job
    for (const job of jobs) {
      try {
        if (!job.subject && !job.plaintext_content) {
          if (verbose) console.log(`⚠️ Skipping job ${job.id}: no email metadata`);
          continue;
        }
        
        // Prepare normalization input
        const normalizeInput = {
          subject: job.subject || '',
          plaintext: job.plaintext_content || job.raw_content || '',
          fromAddress: job.from_address || ''
        };
        
        // Mock LLM result based on existing data
        const mockLlmResult = {
          is_job_related: true,
          company: job.company,
          position: job.position,
          status: job.status,
          confidence: job.ml_confidence || 0.5
        };
        
        // Apply normalization
        const normalized = normalizeResult(normalizeInput, mockLlmResult);
        
        // Check for changes
        const hasChanges = 
          normalized.company !== job.company ||
          normalized.position !== job.position ||
          normalized.status !== job.status;
        
        if (hasChanges) {
          changed++;
          
          // Track change types
          if (normalized.company !== job.company) changesSummary.company++;
          if (normalized.position !== job.position) changesSummary.position++;
          if (normalized.status !== job.status) changesSummary.status++;
          
          // Collect examples
          if (examples.length < 5) {
            examples.push({
              id: job.id,
              subject: job.subject,
              before: {
                company: job.company,
                position: job.position,
                status: job.status
              },
              after: {
                company: normalized.company,
                position: normalized.position,
                status: normalized.status
              },
              notes: normalized.notes
            });
          }
          
          // Apply changes if not dry run
          if (!isDryRun) {
            const updateStmt = db.prepare(`
              UPDATE jobs 
              SET company = ?, position = ?, status = ?, ml_confidence = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `);
            
            updateStmt.run(
              normalized.company,
              normalized.position,
              normalized.status,
              normalized.confidence,
              job.id
            );
          }
          
          if (verbose) {
            console.log(`✏️ ${isDryRun ? '[DRY RUN] ' : ''}Updated job ${job.id}:`);
            console.log(`   Company: "${job.company}" -> "${normalized.company}"`);
            console.log(`   Position: "${job.position}" -> "${normalized.position}"`);
            console.log(`   Status: "${job.status}" -> "${normalized.status}"`);
            if (normalized.notes) {
              console.log(`   Notes: ${normalized.notes.join(', ')}`);
            }
          }
        }
        
      } catch (error) {
        errors++;
        console.error(`❌ Error processing job ${job.id}:`, error.message);
      }
    }
    
    // Print summary
    console.log('\\n📈 NORMALIZATION SUMMARY');
    console.log('=' .repeat(50));
    console.log(`📊 Total jobs processed: ${jobs.length}`);
    console.log(`✏️ Jobs ${isDryRun ? 'that would be ' : ''}changed: ${changed}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`\\n🔧 Changes by field:`);
    console.log(`   Company: ${changesSummary.company}`);
    console.log(`   Position: ${changesSummary.position}`);
    console.log(`   Status: ${changesSummary.status}`);
    
    // Show examples
    if (examples.length > 0) {
      console.log('\\n🎯 Example changes:');
      examples.forEach((example, i) => {
        console.log(`\\n${i + 1}. Subject: "${example.subject}"`);
        console.log(`   Company: "${example.before.company}" -> "${example.after.company}"`);
        console.log(`   Position: "${example.before.position}" -> "${example.after.position}"`);
        console.log(`   Status: "${example.before.status}" -> "${example.after.status}"`);
        if (example.notes) {
          console.log(`   Applied: ${example.notes.join(', ')}`);
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