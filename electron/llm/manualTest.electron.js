const fs = require('fs');
const path = require('path');

// Import actual config values instead of hardcoded defaults
const { 
  ONLYJOBS_MODEL_PATH, 
  ONLYJOBS_TEMPERATURE,
  ONLYJOBS_MAX_TOKENS,
  ONLYJOBS_CTX,
  ONLYJOBS_N_GPU_LAYERS,
  ONLYJOBS_ENABLE_PREFILTER,
  ONLYJOBS_INFER_TIMEOUT_MS,
  ONLYJOBS_EARLY_STOP_JSON
} = require('./config.js');

const MODEL_PATH = ONLYJOBS_MODEL_PATH;
const TEMP = ONLYJOBS_TEMPERATURE;
const MAX_TOKENS = ONLYJOBS_MAX_TOKENS;
const CTX = ONLYJOBS_CTX;
const GPU_LAYERS = ONLYJOBS_N_GPU_LAYERS;
const ENABLE_PREFILTER = ONLYJOBS_ENABLE_PREFILTER;
const TIMEOUT_MS = ONLYJOBS_INFER_TIMEOUT_MS;
const EARLY_STOP = ONLYJOBS_EARLY_STOP_JSON;

// Set test environment to disable cache
process.env.ONLYJOBS_DISABLE_CACHE_FOR_TEST = '1';

const testCases = [
  {
    name: 'Job Application',
    subject: 'Application Received - Software Engineer at TechCorp',
    plaintext: 'Dear Candidate,\n\nThank you for applying to the Software Engineer position at TechCorp. We have received your application and will review it shortly.\n\nBest regards,\nHR Team'
  },
  {
    name: 'Interview Invitation', 
    subject: 'Interview Invitation - Data Analyst Role',
    plaintext: 'Hi there,\n\nWe would like to schedule an interview for the Data Analyst position at Analytics Inc. Are you available next Tuesday?\n\nThanks,\nSarah'
  },
  {
    name: 'Non-job Email',
    subject: 'Your Netflix subscription expires soon',
    plaintext: 'Your monthly Netflix subscription will expire in 3 days. Please update your payment method to continue enjoying our services.'
  }
];

async function testLLMEngine() {
  console.log('🧪 Testing LLM engine with performance features...');
  console.log(`⚙️ Config: prefilter=${ENABLE_PREFILTER}, timeout=${TIMEOUT_MS}ms, ctx=${CTX}, tokens=${MAX_TOKENS}, earlyStop=${EARLY_STOP}`);
  
  // Import the LLM engine (use CommonJS for testing)
  const { parseEmailWithLLM } = require('./llmEngine.js');
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`📧 Subject: "${testCase.subject}"`);
    
    const startTime = Date.now();
    try {
      const result = await parseEmailWithLLM({
        subject: testCase.subject,
        plaintext: testCase.plaintext
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ Result (${duration}ms):`, JSON.stringify(result, null, 2));
      
      // Validate schema
      const requiredKeys = ['is_job_related', 'company', 'position', 'status'];
      const missingKeys = requiredKeys.filter(key => !(key in result));
      if (missingKeys.length > 0) {
        console.warn(`⚠️ Missing keys: ${missingKeys.join(', ')}`);
      }
      
      if (typeof result.is_job_related !== 'boolean') {
        console.warn('⚠️ is_job_related should be boolean');
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Error (${duration}ms):`, error.message);
    }
  }
}

async function main() {
  console.log('🧪 Electron LLM JS test starting…');
  console.log('🔧 Model path:', MODEL_PATH);
  
  if (!fs.existsSync(MODEL_PATH)) {
    console.error('❌ Model missing at', MODEL_PATH);
    process.exit(1);
  }
  
  try {
    await testLLMEngine();
    console.log('\n🎉 Manual tests completed!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err && err.stack || err);
    console.error('ℹ️ If you rebuilt for Electron, always run tests under ELECTRON_RUN_AS_NODE=1 using the Electron binary.');
    console.error('ℹ️ Try: npm run rebuild:llm');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });