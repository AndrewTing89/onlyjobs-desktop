/**
 * Two-Stage LLM Classifier
 * Stage 1: Fast binary classification (job-related or not)
 * Stage 2: Detailed extraction (only for job-related emails)
 */

const Store = require('electron-store').default || require('electron-store');
const { LLM_TEMPERATURE, LLM_MAX_TOKENS, LLM_CONTEXT, GPU_LAYERS } = require('./config');

// Store for saving model-specific prompts
const promptStore = new Store({ name: 'model-prompts' });

// Track loaded models and contexts (not sessions)
// Add unique ID to verify this is the same module instance
const MODULE_ID = Math.random().toString(36).substring(7);
console.log(`🔧 two-stage-classifier module loaded with ID: ${MODULE_ID}`);

const loadedModels = new Map();
const loadedContexts = new Map();

// Track context usage for refresh
const contextUsageCount = new Map();
const MAX_CONTEXT_USES = 10; // Refresh context after 10 classifications (more conservative to avoid exhaustion)

// Default Stage 1 prompts (classification) - optimized for speed
const DEFAULT_STAGE1_PROMPTS = {
  'llama-3-8b-instruct-q5_k_m': `Classify this email as job-related or not.
Job-related: applications, interviews, recruiting, offers, rejections
Output only: {"is_job": true} or {"is_job": false}`,

  'qwen2.5-7b-instruct-q5_k_m': `Is this email job-related?
Reply with only: {"is_job": true} or {"is_job": false}`,

  'hermes-2-pro-mistral-7b-q5_k_m': `<function>classify_email</function>
<instruction>Determine if email is job-related</instruction>
<output>{"is_job": boolean}</output>

Output only the JSON:`
};

// Default Stage 2 prompts (extraction) - optimized for accuracy
const DEFAULT_STAGE2_PROMPTS = {
  'llama-3-8b-instruct-q5_k_m': `Extract job details from this email.

Examples:
- "Thank you for applying to Google for Software Engineer" → {"company": "Google", "position": "Software Engineer", "status": "Applied"}
- "Interview scheduled for Data Analyst role at Meta" → {"company": "Meta", "position": "Data Analyst", "status": "Interview"}
- "We're pleased to offer you the position at Amazon" → {"company": "Amazon", "position": null, "status": "Offer"}
- "Unfortunately, we won't be moving forward" → {"company": null, "position": null, "status": "Declined"}

Output JSON only: {"company": string|null, "position": string|null, "status": "Applied"|"Interview"|"Declined"|"Offer"|null}`,

  'qwen2.5-7b-instruct-q5_k_m': `Extract job details.
Output: {"company": string|null, "position": string|null, "status": "Applied"|"Interview"|"Declined"|"Offer"|null}
Rules: Use null for unknown fields. Extract actual company name, not ATS.
JSON:`,

  'hermes-2-pro-mistral-7b-q5_k_m': `<function>extract_job_details</function>
<parameters>
  company: string|null
  position: string|null  
  status: "Applied"|"Interview"|"Declined"|"Offer"|null
</parameters>
<output>JSON only</output>`
};

// Default Stage 3 prompts (job matching) - for determining if two jobs are the same
const DEFAULT_STAGE3_PROMPTS = {
  'llama-3-8b-instruct-q5_k_m': `Compare these two job applications and determine if they refer to the same position.

Consider:
- Same company and position title = likely same job
- Same company, similar titles (e.g., "Software Engineer" vs "SWE") = likely same job
- Different companies = different jobs
- Same company, very different roles = different jobs

Output only: {"same_job": true} or {"same_job": false}`,

  'qwen2.5-7b-instruct-q5_k_m': `Are these two job applications for the same position?
Output: {"same_job": boolean}`,

  'hermes-2-pro-mistral-7b-q5_k_m': `<function>compare_jobs</function>
<instruction>Determine if two job applications are for the same position</instruction>
<output>{"same_job": boolean}</output>`,

  'phi-3.5-mini-instruct-q5_k_m': `Task: Compare two job applications
Output JSON: {"same_job": true/false}
Rules: Same company + similar role = true, different company = false`,

  'hermes-3-llama-3.1-8b-q5_k_m': `Analyze if these two job applications are for the same position.
Consider company name and job title similarity.
Return: {"same_job": boolean}`,

  'qwen2.5-3b-instruct-q5_k_m': `Check if jobs match:
- Same company + similar title = true
- Different company = false
Output: {"same_job": boolean}`
};

async function loadLlamaModule() {
  try {
    return await import('node-llama-cpp');
  } catch (error) {
    throw new Error("node-llama-cpp is not installed or failed to build");
  }
}

async function ensureModelLoaded(modelId, modelPath) {
  console.log(`🔍 [Module ${MODULE_ID}] Checking model cache for ${modelId}. Current cache:`, Array.from(loadedModels.keys()));
  
  if (loadedModels.has(modelId)) {
    console.log(`✅ [Module ${MODULE_ID}] Model ${modelId} already loaded, reusing existing model`);
    return loadedModels.get(modelId);
  }
  
  console.log(`⚠️ [Module ${MODULE_ID}] Model ${modelId} NOT in cache (cache size: ${loadedModels.size}), loading from ${modelPath}`);
  
  const fs = require('fs');
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }
  
  const module = await loadLlamaModule();
  const { getLlama } = module;
  
  try {
    const llama = await getLlama();
    const model = await llama.loadModel({ 
      modelPath,
      gpuLayers: GPU_LAYERS || 0
    });
    
    loadedModels.set(modelId, model);
    console.log(`TwoStage: Model ${modelId} loaded successfully and cached (cache size now: ${loadedModels.size})`);
    console.log(`TwoStage: Cache contents:`, Array.from(loadedModels.keys()));
    return model;
  } catch (error) {
    console.error(`TwoStage: Error loading model ${modelId}:`, error);
    throw error;
  }
}

async function getOrCreateContext(modelId, modelPath, forceRefresh = false) {
  const contextKey = `${modelId}_context`;
  
  // Check usage count and force refresh if needed
  const usageCount = contextUsageCount.get(contextKey) || 0;
  if (usageCount >= MAX_CONTEXT_USES) {
    console.log(`📊 Context for ${modelId} has been used ${usageCount} times, refreshing...`);
    forceRefresh = true;
  }
  
  // Reuse existing context if available and not forcing refresh
  if (!forceRefresh && loadedContexts.has(contextKey)) {
    // Increment usage count
    contextUsageCount.set(contextKey, usageCount + 1);
    console.log(`✅ Reusing existing context for ${modelId} (usage ${usageCount + 1}/${MAX_CONTEXT_USES})`);
    return loadedContexts.get(contextKey);
  }
  
  // Dispose old context if refreshing
  if (forceRefresh && loadedContexts.has(contextKey)) {
    const oldContext = loadedContexts.get(contextKey);
    try {
      if (oldContext && oldContext.dispose) {
        oldContext.dispose();
      }
    } catch (e) {
      console.error('Error disposing old context:', e);
    }
    loadedContexts.delete(contextKey);
  }
  
  // Create new context
  const model = await ensureModelLoaded(modelId, modelPath);
  const module = await loadLlamaModule();
  const { LlamaContext } = module;
  
  const context = await model.createContext({ 
    contextSize: LLM_CONTEXT, 
    batchSize: 512 
  });
  
  loadedContexts.set(contextKey, context);
  contextUsageCount.set(contextKey, 1); // Reset usage count
  console.log(`✅ Created fresh context for ${modelId}`);
  
  return context;
}

async function createSessionFromContext(context, systemPrompt) {
  const module = await loadLlamaModule();
  const { LlamaChatSession } = module;
  
  const sequence = context.getSequence();
  const session = new LlamaChatSession({ 
    contextSequence: sequence, 
    systemPrompt: systemPrompt
  });
  
  // Return both session and sequence so we can dispose it later
  return { session, sequence };
}

/**
 * Stage 1: Fast binary classification
 */
async function classifyStage1(modelId, modelPath, emailSubject, emailBody, customPrompt = null) {
  const startTime = Date.now();
  
  let sequence = null;
  
  try {
    // Get prompt (custom or default)
    const systemPrompt = customPrompt || getStage1Prompt(modelId);
    
    // Debug: Log if using saved prompt
    const savedPrompt = promptStore.get(`${modelId}.stage1`);
    if (savedPrompt) {
      console.log(`📝 Using SAVED Stage 1 prompt for ${modelId}`);
    } else {
      console.log(`📝 Using DEFAULT Stage 1 prompt for ${modelId}`);
    }
    
    // Get or create context (reused across all classifications)
    const context = await getOrCreateContext(modelId, modelPath);
    
    // Create a fresh session for this classification (using the shared context)
    const { session, sequence: seq } = await createSessionFromContext(context, systemPrompt);
    sequence = seq; // Store for cleanup
    
    // Prepare email content (truncated for speed)
    const maxLength = 800; // Shorter for Stage 1
    const truncatedBody = emailBody.length > maxLength 
      ? emailBody.substring(0, maxLength) + "..."
      : emailBody;
    
    const userPrompt = `Subject: ${emailSubject}\nBody: ${truncatedBody}`;
    
    console.log(`TwoStage: Stage 1 classification with ${modelId}...`);
    
    // Get response with minimal tokens
    const response = await session.prompt(userPrompt, {
      temperature: 0, // Zero temperature for deterministic output
      maxTokens: 15, // Minimal tokens needed for yes/no JSON
    });
    
    const processingTime = Date.now() - startTime;
    console.log(`TwoStage: Stage 1 completed in ${processingTime}ms`);
    
    // IMPORTANT: Dispose sequence to free up context
    if (sequence && sequence.dispose) {
      sequence.dispose();
    }
    
    // Parse response
    let isJob = false;
    try {
      const parsed = JSON.parse(response.trim());
      isJob = parsed.is_job === true;
    } catch (e) {
      // Fallback: check for "true" in response
      isJob = response.toLowerCase().includes('"is_job":true') || 
              response.toLowerCase().includes('"is_job": true');
    }
    
    // Dispose sequence to free resources
    if (sequence && sequence.dispose) {
      sequence.dispose();
    }
    
    return {
      is_job: isJob,
      stage1Time: processingTime,
      rawResponse: response
    };
    
  } catch (error) {
    console.error(`TwoStage: Stage 1 error with ${modelId}:`, error);
    
    // If we ran out of sequences, immediately delete the broken context
    if (error.message && error.message.includes('No sequences left')) {
      console.log(`⚠️ Context exhausted for ${modelId}, removing broken context`);
      const contextKey = `${modelId}_context`;
      
      // Dispose and remove the broken context immediately
      if (loadedContexts.has(contextKey)) {
        const brokenContext = loadedContexts.get(contextKey);
        try {
          if (brokenContext && brokenContext.dispose) {
            brokenContext.dispose();
          }
        } catch (disposeError) {
          // Ignore disposal errors
        }
        loadedContexts.delete(contextKey);
      }
      
      // Reset usage count
      contextUsageCount.delete(contextKey);
    }
    
    // Dispose sequence on error (if not already disposed)
    try {
      if (sequence && sequence.dispose) {
        sequence.dispose();
      }
    } catch (disposeError) {
      // Ignore disposal errors
    }
    return {
      is_job: false,
      stage1Time: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Stage 2: Detailed extraction (only for job emails)
 */
async function extractStage2(modelId, modelPath, emailSubject, emailBody, customPrompt = null) {
  const startTime = Date.now();
  
  let sequence = null;
  
  try {
    // Get prompt (custom or default)  
    const systemPrompt = customPrompt || getStage2Prompt(modelId);
    
    // Debug: Log if using saved prompt
    const savedPrompt = promptStore.get(`${modelId}.stage2`);
    if (savedPrompt) {
      console.log(`📝 Using SAVED Stage 2 prompt for ${modelId}`);
    } else {
      console.log(`📝 Using DEFAULT Stage 2 prompt for ${modelId}`);
    }
    
    // Get or create context (reused across all classifications)
    const context = await getOrCreateContext(modelId, modelPath);
    
    // Create a fresh session for this extraction (using the shared context)
    const { session, sequence: seq } = await createSessionFromContext(context, systemPrompt);
    sequence = seq; // Store for cleanup
    
    // Use full email for extraction
    const maxLength = 1500;
    const truncatedBody = emailBody.length > maxLength 
      ? emailBody.substring(0, maxLength) + "..."
      : emailBody;
    
    const userPrompt = `Subject: ${emailSubject}\nBody: ${truncatedBody}`;
    
    console.log(`TwoStage: Stage 2 extraction with ${modelId}...`);
    
    // Get response with more tokens for detailed extraction
    const response = await session.prompt(userPrompt, {
      temperature: 0, // Zero temperature for deterministic JSON output
      maxTokens: 100, // Enough for structured JSON extraction
    });
    
    const processingTime = Date.now() - startTime;
    console.log(`TwoStage: Stage 2 completed in ${processingTime}ms`);
    
    // IMPORTANT: Dispose sequence to free up context
    if (sequence && sequence.dispose) {
      sequence.dispose();
    }
    
    // Parse response
    let extracted = {
      company: null,
      position: null,
      status: null
    };
    
    try {
      const parsed = JSON.parse(response.trim());
      extracted = {
        company: parsed.company || null,
        position: parsed.position || null,
        status: parsed.status || null
      };
      
      // Clean up "unknown" values
      if (extracted.company === 'unknown') extracted.company = null;
      if (extracted.position === 'unknown') extracted.position = null;
      
    } catch (e) {
      console.error(`TwoStage: Failed to parse Stage 2 JSON:`, response);
    }
    
    // Dispose sequence to free resources
    if (sequence && sequence.dispose) {
      sequence.dispose();
    }
    
    return {
      ...extracted,
      stage2Time: processingTime,
      rawResponse: response
    };
    
  } catch (error) {
    console.error(`TwoStage: Stage 2 error with ${modelId}:`, error);
    
    // If we ran out of sequences, immediately delete the broken context
    if (error.message && error.message.includes('No sequences left')) {
      console.log(`⚠️ Context exhausted for ${modelId} in Stage 2, removing broken context`);
      const contextKey = `${modelId}_context`;
      
      // Dispose and remove the broken context immediately
      if (loadedContexts.has(contextKey)) {
        const brokenContext = loadedContexts.get(contextKey);
        try {
          if (brokenContext && brokenContext.dispose) {
            brokenContext.dispose();
          }
        } catch (disposeError) {
          // Ignore disposal errors
        }
        loadedContexts.delete(contextKey);
      }
      
      // Reset usage count
      contextUsageCount.delete(contextKey);
    }
    
    // Dispose sequence on error (if not already disposed)
    try {
      if (sequence && sequence.dispose) {
        sequence.dispose();
      }
    } catch (disposeError) {
      // Ignore disposal errors
    }
    return {
      company: null,
      position: null,
      status: null,
      stage2Time: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Stage 3 - Job Matching: Determine if two job applications are the same position
 */
async function matchJobs(modelId, modelPath, job1, job2, customPrompt = null) {
  const startTime = Date.now();
  
  let sequence = null;
  
  try {
    // Get prompt (custom or default)
    const systemPrompt = customPrompt || getStage3Prompt(modelId);
    
    // Get or create context (reused across all classifications)
    const context = await getOrCreateContext(modelId, modelPath);
    
    // Create a fresh session for this matching (using the shared context)
    const { session, sequence: seq } = await createSessionFromContext(context, systemPrompt);
    sequence = seq; // Store for cleanup
    
    // Format job information for comparison
    const job1Info = `Job 1:\nCompany: ${job1.company || 'Unknown'}\nPosition: ${job1.position || 'Unknown'}\nStatus: ${job1.status || 'Unknown'}`;
    const job2Info = `Job 2:\nCompany: ${job2.company || 'Unknown'}\nPosition: ${job2.position || 'Unknown'}\nStatus: ${job2.status || 'Unknown'}`;
    
    const userPrompt = `${job1Info}\n\n${job2Info}`;
    
    console.log(`TwoStage: Matching jobs with ${modelId}...`);
    
    // Get response
    const response = await session.prompt(userPrompt, {
      temperature: 0, // Zero temperature for deterministic output
      maxTokens: 15, // Minimal tokens needed for yes/no JSON
    });
    
    const processingTime = Date.now() - startTime;
    console.log(`TwoStage: Job matching completed in ${processingTime}ms`);
    
    // Parse response
    let sameJob = false;
    try {
      const parsed = JSON.parse(response.trim());
      sameJob = parsed.same_job === true;
    } catch (e) {
      // Fallback: check for "true" in response
      sameJob = response.toLowerCase().includes('"same_job":true') || 
                response.toLowerCase().includes('"same_job": true');
    }
    
    // Dispose sequence to free resources
    if (sequence && sequence.dispose) {
      sequence.dispose();
    }
    
    return {
      same_job: sameJob,
      processingTime,
      rawResponse: response
    };
    
  } catch (error) {
    console.error(`TwoStage: Job matching error with ${modelId}:`, error);
    // Dispose sequence on error too
    if (sequence && sequence.dispose) {
      sequence.dispose();
    }
    return {
      same_job: false,
      processingTime: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Full two-stage classification
 */
async function classifyTwoStage(modelId, modelPath, emailSubject, emailBody, stage1Prompt = null, stage2Prompt = null) {
  const startTime = Date.now();
  
  // Stage 1: Classification
  const stage1Result = await classifyStage1(modelId, modelPath, emailSubject, emailBody, stage1Prompt);
  
  if (!stage1Result.is_job) {
    // Not job-related, return early
    return {
      is_job_related: false,
      company: null,
      position: null,
      status: null,
      modelId,
      totalTime: Date.now() - startTime,
      stage1Time: stage1Result.stage1Time,
      stage2Time: 0,
      stage1Response: stage1Result.rawResponse
    };
  }
  
  // Stage 2: Extraction (only for job emails)
  const stage2Result = await extractStage2(modelId, modelPath, emailSubject, emailBody, stage2Prompt);
  
  return {
    is_job_related: true,
    company: stage2Result.company,
    position: stage2Result.position,
    status: stage2Result.status,
    modelId,
    totalTime: Date.now() - startTime,
    stage1Time: stage1Result.stage1Time,
    stage2Time: stage2Result.stage2Time,
    stage1Response: stage1Result.rawResponse,
    stage2Response: stage2Result.rawResponse
  };
}

/**
 * Get saved or default prompts
 */
function getStage1Prompt(modelId) {
  const saved = promptStore.get(`${modelId}.stage1`);
  return saved || DEFAULT_STAGE1_PROMPTS[modelId] || DEFAULT_STAGE1_PROMPTS['qwen2.5-7b-instruct-q5_k_m'];
}

function getStage2Prompt(modelId) {
  const saved = promptStore.get(`${modelId}.stage2`);
  return saved || DEFAULT_STAGE2_PROMPTS[modelId] || DEFAULT_STAGE2_PROMPTS['qwen2.5-7b-instruct-q5_k_m'];
}

function getStage3Prompt(modelId) {
  const saved = promptStore.get(`${modelId}.stage3`);
  return saved || DEFAULT_STAGE3_PROMPTS[modelId] || DEFAULT_STAGE3_PROMPTS['qwen2.5-7b-instruct-q5_k_m'];
}

/**
 * Save custom prompts
 */
function saveStage1Prompt(modelId, prompt) {
  promptStore.set(`${modelId}.stage1`, prompt);
}

function saveStage2Prompt(modelId, prompt) {
  promptStore.set(`${modelId}.stage2`, prompt);
}

function saveStage3Prompt(modelId, prompt) {
  promptStore.set(`${modelId}.stage3`, prompt);
}

/**
 * Get all prompts for a model
 */
function getModelPrompts(modelId) {
  return {
    stage1: getStage1Prompt(modelId),
    stage2: getStage2Prompt(modelId),
    stage3: getStage3Prompt(modelId)
  };
}

/**
 * Reset prompts to defaults
 */
function resetPrompts(modelId) {
  promptStore.delete(`${modelId}.stage1`);
  promptStore.delete(`${modelId}.stage2`);
  promptStore.delete(`${modelId}.stage3`);
}

// Cleanup function
async function cleanup() {
  console.log('TwoStage: Cleaning up loaded models and contexts');
  
  // Clean up contexts
  for (const [key, context] of loadedContexts) {
    try {
      if (context && context.dispose) {
        context.dispose();
      }
    } catch (e) {
      console.error(`Error disposing context for ${key}:`, e);
    }
  }
  
  loadedContexts.clear();
  loadedModels.clear();
  contextUsageCount.clear();
}

module.exports = {
  classifyTwoStage,
  classifyStage1,
  extractStage2,
  matchJobs,
  getStage1Prompt,
  getStage2Prompt,
  getStage3Prompt,
  saveStage1Prompt,
  saveStage2Prompt,
  saveStage3Prompt,
  getModelPrompts,
  resetPrompts,
  cleanup,
  DEFAULT_STAGE1_PROMPTS,
  DEFAULT_STAGE2_PROMPTS,
  DEFAULT_STAGE3_PROMPTS
};