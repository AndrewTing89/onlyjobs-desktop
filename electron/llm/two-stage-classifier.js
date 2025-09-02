/**
 * Optimized Three-Stage LLM Classifier
 * 
 * Key improvements:
 * - Stateless: Each email gets its own fresh context
 * - Lightweight: Small context sizes for each stage  
 * - Simple: No complex state management or context reuse
 * - Fast: Optimized prompts and early exits
 * - Complete: Includes Stage 3 for job matching/deduplication
 */

const Store = require('electron-store').default || require('electron-store');
const { 
  GPU_LAYERS, 
  STAGE1_CONTEXT_SIZE, 
  STAGE2_CONTEXT_SIZE,
  STAGE3_CONTEXT_SIZE,
  STAGE1_MAX_TOKENS,
  STAGE2_MAX_TOKENS,
  STAGE3_MAX_TOKENS
} = require('./config');
const { getMLClassifier } = require('../ml-classifier-bridge');

// Store for saving model-specific prompts
const promptStore = new Store({ name: 'model-prompts' });

// Single global model cache - models are expensive to load (60+ seconds)
const loadedModels = new Map();

// Context pools for each stage - reuse contexts safely
const contextPools = {
  stage1: new Map(), // modelId -> {context, lastUsed}
  stage2: new Map(), // modelId -> {context, lastUsed}  
  stage3: new Map()  // modelId -> {context, lastUsed}
};

// Keep contexts alive for 5 minutes (increased from immediate disposal)
const CONTEXT_POOL_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up stale contexts periodically
function cleanStaleContexts() {
  const now = Date.now();
  for (const [stage, pool] of Object.entries(contextPools)) {
    for (const [modelId, entry] of pool.entries()) {
      if (now - entry.lastUsed > CONTEXT_POOL_TTL) {
        console.log(`🧹 Cleaning stale ${stage} context for ${modelId}`);
        try {
          entry.context.dispose();
        } catch (e) {
          console.error(`Error disposing context:`, e);
        }
        pool.delete(modelId);
      }
    }
  }
}

// Run context cleanup every 2 minutes
setInterval(cleanStaleContexts, 2 * 60 * 1000);

// LLM result cache to avoid re-processing similar emails
const llmCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Generate cache key from email content
function getCacheKey(subject, body, stage = 'classification') {
  const crypto = require('crypto');
  const content = `${stage}::${subject}::${body.substring(0, 500)}`;
  return crypto.createHash('md5').update(content).digest('hex');
}

// Check if cache entry is still valid
function isCacheValid(entry) {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// Clean expired cache entries periodically
function cleanCache() {
  for (const [key, entry] of llmCache.entries()) {
    if (!isCacheValid(entry)) {
      llmCache.delete(key);
    }
  }
}

// Run cache cleanup every hour
setInterval(cleanCache, 60 * 60 * 1000);

// Get cache statistics for monitoring
function getCacheStats() {
  let validCount = 0;
  let expiredCount = 0;
  
  for (const [key, entry] of llmCache.entries()) {
    if (isCacheValid(entry)) {
      validCount++;
    } else {
      expiredCount++;
    }
  }
  
  return {
    totalEntries: llmCache.size,
    validEntries: validCount,
    expiredEntries: expiredCount,
    cacheHitRate: llmCache.size > 0 ? (validCount / llmCache.size * 100).toFixed(1) + '%' : 'N/A',
    ttlHours: CACHE_TTL / (60 * 60 * 1000),
    contextPools: {
      stage1: contextPools.stage1.size,
      stage2: contextPools.stage2.size,
      stage3: contextPools.stage3.size
    },
    contextPoolTTLMinutes: CONTEXT_POOL_TTL / (60 * 1000)
  };
}

// Optimized Stage 1 prompts - ultra concise
const OPTIMIZED_STAGE1_PROMPTS = {
  'llama-3-8b-instruct-q5_k_m': 'Job-related email? Output only: {"is_job":true} or {"is_job":false}',
  'qwen2.5-7b-instruct-q5_k_m': 'Job email? Reply: {"is_job":boolean}',
  'qwen2.5-3b-instruct-q5_k_m': 'Job? {"is_job":bool}',
  'phi-3.5-mini-instruct-q5_k_m': 'Job application/interview/offer? {"is_job":bool}',
  'hermes-3-llama-3.1-8b-q5_k_m': 'Is job-related? {"is_job":true/false}',
  'hermes-2-pro-mistral-7b-q5_k_m': '<job_check>{"is_job":boolean}</job_check>'
};

// Optimized Stage 2 prompts - direct extraction (EXPLICIT about JSON-only)
const OPTIMIZED_STAGE2_PROMPTS = {
  'llama-3-8b-instruct-q5_k_m': `Output ONLY valid JSON, no other text.
Format: {"company":"...","position":"...","status":"Applied"|"Interview"|"Declined"|"Offer"}
Use null for unknown fields. No explanation, just JSON.`,
  
  'qwen2.5-7b-instruct-q5_k_m': `Output ONLY JSON: {"company":"...","position":"...","status":"Applied/Interview/Declined/Offer"}
No other text.`,
  
  'qwen2.5-3b-instruct-q5_k_m': 'JSON only: {"company":"...","position":"...","status":"..."}',
  
  'phi-3.5-mini-instruct-q5_k_m': 'Output only JSON: {"company":"X","position":"Y","status":"Z"}',
  
  'hermes-3-llama-3.1-8b-q5_k_m': 'Return ONLY JSON: {"company":"...","position":"...","status":"..."} Use null for unknown.',
  
  'hermes-2-pro-mistral-7b-q5_k_m': '<extract>{"company":"...","position":"...","status":"..."}</extract>'
};

// Optimized Stage 3 prompts - job matching
const OPTIMIZED_STAGE3_PROMPTS = {
  'llama-3-8b-instruct-q5_k_m': 'Are these the same job? Output only: {"same_job":true} or {"same_job":false}',
  
  'qwen2.5-7b-instruct-q5_k_m': 'Same position? {"same_job":boolean}',
  
  'qwen2.5-3b-instruct-q5_k_m': 'Match? {"same_job":bool}',
  
  'phi-3.5-mini-instruct-q5_k_m': 'Same job? {"same_job":bool}',
  
  'hermes-3-llama-3.1-8b-q5_k_m': 'Jobs match? {"same_job":true/false}',
  
  'hermes-2-pro-mistral-7b-q5_k_m': '<match>{"same_job":boolean}</match>'
};

/**
 * Load LLama module dynamically
 */
async function loadLlamaModule() {
  try {
    return await import('node-llama-cpp');
  } catch (error) {
    console.error("Failed to load node-llama-cpp:", error);
    throw new Error("node-llama-cpp is not installed or failed to build");
  }
}

/**
 * Ensure model is loaded (cached after first load)
 */
async function ensureModelLoaded(modelId, modelPath) {
  // Check cache first
  if (loadedModels.has(modelId)) {
    console.log(`✅ Reusing cached model: ${modelId}`);
    return loadedModels.get(modelId);
  }
  
  console.log(`📦 Loading model ${modelId} from disk (this takes ~60 seconds)...`);
  
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
    
    // Cache for future use
    loadedModels.set(modelId, model);
    console.log(`✅ Model ${modelId} loaded and cached`);
    return model;
  } catch (error) {
    console.error(`Failed to load model ${modelId}:`, error);
    throw error;
  }
}

/**
 * Get or create a reusable context for a specific stage
 * Contexts are reused but sequences are disposed after each use
 */
async function getOrCreateContext(model, modelId, stage, contextSize, forceNew = false) {
  const pool = contextPools[stage];
  
  // Check if we have a valid context
  const entry = pool.get(modelId);
  const hasValidContext = entry && !forceNew;
  
  // Force new context if requested or if context doesn't exist
  if (!hasValidContext) {
    // Dispose old context if forcing new
    if (forceNew && entry) {
      console.log(`🔄 Disposing exhausted ${stage} context for ${modelId}`);
      try {
        entry.context.dispose();
      } catch (e) {
        console.error(`Error disposing old context:`, e);
      }
    }
    
    console.log(`📦 Creating NEW ${stage} context for ${modelId} (size: ${contextSize})`);
    const contextStart = Date.now();
    const context = await model.createContext({ 
      contextSize,
      batchSize: 128  // Small batch size for efficiency
    });
    console.log(`⏱️ Context creation took ${Date.now() - contextStart}ms for ${stage}`);
    
    pool.set(modelId, {
      context,
      lastUsed: Date.now()
    });
    console.log(`✅ Context created and pooled for ${stage}/${modelId}`);
    
    return context;
  } else {
    // Update last used time
    entry.lastUsed = Date.now();
    const ageSeconds = Math.round((Date.now() - entry.lastUsed) / 1000);
    console.log(`♻️ REUSING existing ${stage} context for ${modelId} (will stay alive for ${Math.round(CONTEXT_POOL_TTL / 1000)}s)`);
    
    return entry.context;
  }
}

/**
 * Stage 1: Fast binary classification (stateless)
 */
async function classifyStage1(modelId, modelPath, emailSubject, emailBody) {
  const startTime = Date.now();
  
  // Check cache first
  const cacheKey = getCacheKey(emailSubject, emailBody, 'stage1');
  const cached = llmCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    console.log(`📋 Stage 1 cache hit - skipping LLM inference`);
    return {
      ...cached.result,
      stage1Time: Date.now() - startTime,
      fromCache: true
    };
  }
  
  try {
    // Get model (cached after first load)
    const model = await ensureModelLoaded(modelId, modelPath);
    
    // Try to get context and sequence, recreate if exhausted
    let context;
    let sequence;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount < maxRetries) {
      try {
        // Get or create reusable context for Stage 1
        const contextStart = Date.now();
        context = await getOrCreateContext(model, modelId, 'stage1', STAGE1_CONTEXT_SIZE, retryCount > 0);
        console.log(`⏱️ Context ready in ${Date.now() - contextStart}ms`);
        
        // Try to get a fresh sequence from the reusable context
        const seqStart = Date.now();
        sequence = context.getSequence();
        console.log(`⏱️ Sequence created in ${Date.now() - seqStart}ms`);
        break; // Success, exit retry loop
        
      } catch (error) {
        if (error.message.includes('No sequences left') && retryCount < maxRetries - 1) {
          console.log(`⚠️ Context exhausted, creating fresh context (retry ${retryCount + 1}/${maxRetries})`);
          retryCount++;
        } else {
          throw error; // Re-throw if not sequence error or max retries reached
        }
      }
    }
    
    try {
      // Get prompt (custom or optimized default)
      const savedPrompt = promptStore.get(`${modelId}.stage1`);
      const systemPrompt = savedPrompt || OPTIMIZED_STAGE1_PROMPTS[modelId] || OPTIMIZED_STAGE1_PROMPTS['llama-3-8b-instruct-q5_k_m'];
      
      if (savedPrompt) {
        console.log(`📝 Using custom Stage 1 prompt for ${modelId}`);
      }
      
      // Create session
      const module = await loadLlamaModule();
      const { LlamaChatSession } = module;
      const session = new LlamaChatSession({ 
        contextSequence: sequence, 
        systemPrompt
      });
      
      // Prepare email (truncated aggressively for speed)
      const maxLength = 400;  // Reduced from 800
      const truncatedBody = emailBody.length > maxLength 
        ? emailBody.substring(0, maxLength) + "..."
        : emailBody;
      
      const userPrompt = `Subject: ${emailSubject}\nBody: ${truncatedBody}`;
      
      // Get response with minimal tokens
      const promptStart = Date.now();
      const response = await session.prompt(userPrompt, {
        temperature: 0,
        maxTokens: STAGE1_MAX_TOKENS
      });
      console.log(`⏱️ LLM inference took ${Date.now() - promptStart}ms`);
      
      // Parse response
      let isJob = false;
      try {
        const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
        const parsed = JSON.parse(cleanResponse);
        isJob = parsed.is_job === true;
      } catch (e) {
        // Fallback: check for "true" in response
        isJob = response.toLowerCase().includes('"is_job":true') || 
                response.toLowerCase().includes('"is_job": true');
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`⚡ Stage 1 completed in ${processingTime}ms - Result: ${isJob ? 'Job-related' : 'Not job'}`);
      
      const result = {
        is_job: isJob,
        stage1Time: processingTime,
        rawResponse: response
      };
      
      // Cache the result
      llmCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
      
      return result;
      
    } finally {
      // Dispose the sequence, not the context (context is reused)
      sequence.dispose();
    }
    
  } catch (error) {
    console.error(`Stage 1 error with ${modelId}:`, error);
    return {
      is_job: false,
      stage1Time: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Stage 2: Detailed extraction (stateless)
 */
async function extractStage2(modelId, modelPath, emailSubject, emailBody) {
  const startTime = Date.now();
  
  // Check cache first
  const cacheKey = getCacheKey(emailSubject, emailBody, 'stage2');
  const cached = llmCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    console.log(`📋 Stage 2 cache hit - skipping LLM inference`);
    return {
      ...cached.result,
      stage2Time: Date.now() - startTime,
      fromCache: true
    };
  }
  
  try {
    // Get model (cached)
    const model = await ensureModelLoaded(modelId, modelPath);
    
    // Try to get context and sequence, recreate if exhausted
    let context;
    let sequence;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount < maxRetries) {
      try {
        // Get or create reusable context for Stage 2
        context = await getOrCreateContext(model, modelId, 'stage2', STAGE2_CONTEXT_SIZE, retryCount > 0);
        
        // Try to get a fresh sequence from the reusable context
        sequence = context.getSequence();
        break; // Success, exit retry loop
        
      } catch (error) {
        if (error.message.includes('No sequences left') && retryCount < maxRetries - 1) {
          console.log(`⚠️ Stage 2 context exhausted, creating fresh context (retry ${retryCount + 1}/${maxRetries})`);
          retryCount++;
        } else {
          throw error; // Re-throw if not sequence error or max retries reached
        }
      }
    }
    
    try {
      // Get prompt
      const savedPrompt = promptStore.get(`${modelId}.stage2`);
      const systemPrompt = savedPrompt || OPTIMIZED_STAGE2_PROMPTS[modelId] || OPTIMIZED_STAGE2_PROMPTS['llama-3-8b-instruct-q5_k_m'];
      
      if (savedPrompt) {
        console.log(`📝 Using custom Stage 2 prompt for ${modelId}`);
      }
      
      // Create session
      const module = await loadLlamaModule();
      const { LlamaChatSession } = module;
      const session = new LlamaChatSession({ 
        contextSequence: sequence, 
        systemPrompt
      });
      
      // Use more content for extraction
      const maxLength = 1000;  // Reduced from 1500
      const truncatedBody = emailBody.length > maxLength 
        ? emailBody.substring(0, maxLength) + "..."
        : emailBody;
      
      const userPrompt = `Subject: ${emailSubject}\nBody: ${truncatedBody}`;
      
      // Get response
      const response = await session.prompt(userPrompt, {
        temperature: 0,
        maxTokens: STAGE2_MAX_TOKENS
      });
      
      // Parse extraction with robust JSON extraction
      let result = { company: null, position: null, status: null };
      try {
        const parsed = extractJSONFromResponse(response);
        
        result.company = parsed.company || null;
        result.position = parsed.position || null;
        result.status = parsed.status || null;
        
        // Status normalization is now handled in extractJSONFromResponse
        
        // Log if we had to extract from chatty response
        if (response.length > 100 && !response.trim().startsWith('{')) {
          console.log('📝 Extracted JSON from verbose LLM response');
        }
      } catch (e) {
        console.error('Failed to parse Stage 2 response:', e);
        console.error('Raw response was:', response.substring(0, 200));
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`⚡ Stage 2 completed in ${processingTime}ms - Extracted: ${result.company} / ${result.position}`);
      
      const finalResult = {
        ...result,
        stage2Time: processingTime,
        rawResponse: response
      };
      
      // Cache the result
      llmCache.set(cacheKey, {
        result: finalResult,
        timestamp: Date.now()
      });
      
      return finalResult;
      
    } finally {
      // Dispose the sequence, not the context (context is reused)
      sequence.dispose();
    }
    
  } catch (error) {
    console.error(`Stage 2 error with ${modelId}:`, error);
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
 * Stage 3: Job matching (stateless)
 */
async function matchJobs(modelId, modelPath, job1, job2) {
  const startTime = Date.now();
  
  // Generate cache key for job matching
  const jobStr1 = `${job1.company}::${job1.position}`;
  const jobStr2 = `${job2.company}::${job2.position}`;
  const cacheKey = getCacheKey(jobStr1, jobStr2, 'stage3');
  
  // Check cache first
  const cached = llmCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    console.log(`📋 Stage 3 cache hit - skipping LLM inference`);
    return {
      ...cached.result,
      stage3Time: Date.now() - startTime,
      fromCache: true
    };
  }
  
  try {
    // Get model (cached)
    const model = await ensureModelLoaded(modelId, modelPath);
    
    // Try to get context and sequence, recreate if exhausted
    let context;
    let sequence;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount < maxRetries) {
      try {
        // Get or create reusable context for Stage 3
        context = await getOrCreateContext(model, modelId, 'stage3', STAGE3_CONTEXT_SIZE, retryCount > 0);
        
        // Try to get a fresh sequence from the reusable context
        sequence = context.getSequence();
        break; // Success, exit retry loop
        
      } catch (error) {
        if (error.message.includes('No sequences left') && retryCount < maxRetries - 1) {
          console.log(`⚠️ Stage 3 context exhausted, creating fresh context (retry ${retryCount + 1}/${maxRetries})`);
          retryCount++;
        } else {
          throw error; // Re-throw if not sequence error or max retries reached
        }
      }
    }
    
    try {
      // Get prompt
      const savedPrompt = promptStore.get(`${modelId}.stage3`);
      const systemPrompt = savedPrompt || OPTIMIZED_STAGE3_PROMPTS[modelId] || OPTIMIZED_STAGE3_PROMPTS['llama-3-8b-instruct-q5_k_m'];
      
      if (savedPrompt) {
        console.log(`📝 Using custom Stage 3 prompt for ${modelId}`);
      }
      
      // Create session
      const module = await loadLlamaModule();
      const { LlamaChatSession } = module;
      const session = new LlamaChatSession({ 
        contextSequence: sequence, 
        systemPrompt
      });
      
      // Format jobs for comparison
      const userPrompt = `Job 1: ${job1.company} - ${job1.position}
Job 2: ${job2.company} - ${job2.position}`;
      
      // Get response
      const response = await session.prompt(userPrompt, {
        temperature: 0,
        maxTokens: STAGE3_MAX_TOKENS
      });
      
      // Parse response
      let sameJob = false;
      try {
        const cleanResponse = response.trim()
          .replace(/```json\n?|\n?```/g, '')
          .replace(/<\/?match>/g, '');
        const parsed = JSON.parse(cleanResponse);
        sameJob = parsed.same_job === true;
      } catch (e) {
        // Fallback
        sameJob = response.toLowerCase().includes('"same_job":true');
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`⚡ Stage 3 completed in ${processingTime}ms - Match: ${sameJob}`);
      
      const result = {
        same_job: sameJob,
        processingTime,
        rawResponse: response
      };
      
      // Cache the result
      llmCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
      
      return result;
      
    } finally {
      // Dispose the sequence, not the context (context is reused)
      sequence.dispose();
    }
    
  } catch (error) {
    console.error(`Stage 3 error with ${modelId}:`, error);
    return {
      same_job: false,
      processingTime: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Full two-stage classification (optimized)
 */
async function classifyTwoStage(modelId, modelPath, emailSubject, emailBody, emailSender = '') {
  const startTime = Date.now();
  
  // Stage 0: ML Pre-classification (1-2ms)
  const mlClassifier = getMLClassifier();
  const mlResult = await mlClassifier.classify(emailSubject, emailBody, emailSender);
  
  // ALWAYS trust ML classification, NEVER use LLM Stage 1
  // But track confidence for manual review
  
  const confidence = mlResult.job_probability || mlResult.confidence || 0;
  const needsReview = confidence < 0.8;
  
  // High confidence - fully trust ML
  if (confidence >= 0.8) {
    if (mlResult.is_job_related) {
      console.log(`✅ ML Stage 0: High confidence job (${confidence.toFixed(2)}) - proceeding to parsing`);
      
      // Skip Stage 1, go directly to Stage 2 extraction
      const stage2Result = await extractStage2(modelId, modelPath, emailSubject, emailBody);
      
      return {
        is_job_related: true,
        ...stage2Result,
        totalTime: Date.now() - startTime,
        mlOnly: true,
        confidence: confidence,
        needs_review: false,
        stage1Time: 0,
        stage2Time: stage2Result.stage2Time
      };
    } else {
      console.log(`✅ ML Stage 0: High confidence non-job (${confidence.toFixed(2)}) - skipping all LLM`);
      
      return {
        is_job_related: false,
        company: null,
        position: null,
        status: null,
        totalTime: Date.now() - startTime,
        mlOnly: true,
        confidence: confidence,
        needs_review: false,
        stage1Time: 0,
        stage2Time: 0
      };
    }
  }
  
  // Low/Medium confidence - still use ML, but flag for review
  if (mlResult.is_job_related) {
    console.log(`🤔 ML Stage 0: Low confidence job (${confidence.toFixed(2)}) - parsing but needs review`);
    
    // Still extract details since ML thinks it's job-related
    const stage2Result = await extractStage2(modelId, modelPath, emailSubject, emailBody);
    
    return {
      is_job_related: true,
      ...stage2Result,
      totalTime: Date.now() - startTime,
      mlOnly: true,
      confidence: confidence,
      needs_review: true,  // Flag for manual review
      stage1Time: 0,
      stage2Time: stage2Result.stage2Time
    };
  } else {
    console.log(`🤔 ML Stage 0: Low confidence non-job (${confidence.toFixed(2)}) - needs review`);
    
    return {
      is_job_related: false,
      company: null,
      position: null,
      status: null,
      totalTime: Date.now() - startTime,
      mlOnly: true,
      confidence: confidence,
      needs_review: true,  // Flag for manual review
      stage1Time: 0,
      stage2Time: 0
    };
  }
}

/**
 * Get/save prompts (for UI editing)
 */
function getStage1Prompt(modelId) {
  const saved = promptStore.get(`${modelId}.stage1`);
  return saved || OPTIMIZED_STAGE1_PROMPTS[modelId] || OPTIMIZED_STAGE1_PROMPTS['llama-3-8b-instruct-q5_k_m'];
}

function getStage2Prompt(modelId) {
  const saved = promptStore.get(`${modelId}.stage2`);
  return saved || OPTIMIZED_STAGE2_PROMPTS[modelId] || OPTIMIZED_STAGE2_PROMPTS['llama-3-8b-instruct-q5_k_m'];
}

function getStage3Prompt(modelId) {
  const saved = promptStore.get(`${modelId}.stage3`);
  return saved || OPTIMIZED_STAGE3_PROMPTS[modelId] || OPTIMIZED_STAGE3_PROMPTS['llama-3-8b-instruct-q5_k_m'];
}

function saveStage1Prompt(modelId, prompt) {
  promptStore.set(`${modelId}.stage1`, prompt);
  return { success: true };
}

function saveStage2Prompt(modelId, prompt) {
  promptStore.set(`${modelId}.stage2`, prompt);
  return { success: true };
}

function saveStage3Prompt(modelId, prompt) {
  promptStore.set(`${modelId}.stage3`, prompt);
  return { success: true };
}

/**
 * Batch extract Stage 2 for multiple emails at once
 * Process up to 5 emails in a single LLM call for efficiency
 */
async function extractStage2Batch(modelId, modelPath, emails) {
  const startTime = Date.now();
  const maxBatchSize = 3; // Process 3 at a time to avoid context overflow
  
  if (emails.length === 1) {
    // Single email, use regular extraction
    return [await extractStage2(modelId, modelPath, emails[0].subject, emails[0].body)];
  }
  
  try {
    // Get model (cached)
    const model = await ensureModelLoaded(modelId, modelPath);
    
    // Get or create context for Stage 2
    let context;
    let sequence;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount < maxRetries) {
      try {
        context = await getOrCreateContext(model, modelId, 'stage2', STAGE2_CONTEXT_SIZE, retryCount > 0);
        sequence = context.getSequence();
        break;
      } catch (error) {
        if (error.message.includes('No sequences left') && retryCount < maxRetries - 1) {
          console.log(`⚠️ Stage 2 batch context exhausted, creating fresh context`);
          retryCount++;
        } else {
          throw error;
        }
      }
    }
    
    try {
      // Create batch prompt
      const savedPrompt = promptStore.get(`${modelId}.stage2`);
      const basePrompt = savedPrompt || OPTIMIZED_STAGE2_PROMPTS[modelId] || OPTIMIZED_STAGE2_PROMPTS['llama-3-8b-instruct-q5_k_m'];
      
      // Format multiple emails for batch extraction
      let batchPrompt = `Extract job details for ${emails.length} emails. Return a JSON array with one object per email.\n\n`;
      
      emails.forEach((email, index) => {
        batchPrompt += `Email ${index + 1}:\nSubject: ${email.subject}\nBody: ${email.body.substring(0, 500)}\n\n`;
      });
      
      batchPrompt += `\nReturn format: [{"company":"...","position":"...","status":"..."}, ...]`;
      
      // Create session
      const module = await loadLlamaModule();
      const { LlamaChatSession } = module;
      const session = new LlamaChatSession({ 
        contextSequence: sequence, 
        systemPrompt: basePrompt
      });
      
      // Get batch response
      const response = await session.prompt(batchPrompt, {
        temperature: 0,
        maxTokens: STAGE2_MAX_TOKENS * emails.length // Scale tokens by batch size
      });
      
      // Parse batch results
      let results = [];
      try {
        const cleanResponse = response.trim()
          .replace(/```json\n?|\n?```/g, '');
        const parsed = JSON.parse(cleanResponse);
        
        if (Array.isArray(parsed)) {
          results = parsed.map(item => ({
            company: item.company || null,
            position: item.position || null,
            status: normalizeStatus(item.status),
            stage2Time: Date.now() - startTime,
            batchProcessed: true
          }));
        }
      } catch (e) {
        console.error('Failed to parse batch Stage 2 response:', e);
        // Fall back to individual processing
        results = emails.map(() => ({
          company: null,
          position: null,
          status: null,
          stage2Time: Date.now() - startTime,
          error: 'Batch parse failed'
        }));
      }
      
      console.log(`⚡ Stage 2 batch completed in ${Date.now() - startTime}ms - Processed ${results.length} emails`);
      return results;
      
    } finally {
      sequence.dispose();
    }
    
  } catch (error) {
    console.error(`Stage 2 batch error:`, error);
    // Fall back to individual processing
    return Promise.all(emails.map(email => 
      extractStage2(modelId, modelPath, email.subject, email.body)
    ));
  }
}

function normalizeStatus(status) {
  if (!status) return null;
  const statusLower = status.toLowerCase();
  if (statusLower.includes('declin') || statusLower.includes('reject')) {
    return 'Declined';
  } else if (statusLower.includes('interview')) {
    return 'Interview';
  } else if (statusLower.includes('offer')) {
    return 'Offer';
  } else {
    return 'Applied';
  }
}

/**
 * Extract JSON from LLM response, even if it contains extra text
 */
function extractJSONFromResponse(response) {
  // First, try direct parse (if response is clean JSON)
  try {
    const cleaned = response.trim()
      .replace(/```json\n?|\n?```/g, '')
      .replace(/<\/?extract>/g, '');
    return JSON.parse(cleaned);
  } catch (e) {
    // If direct parse fails, try to extract JSON from the response
  }
  
  // Remove common prefixes LLMs might add
  let cleaned = response
    .replace(/^.*?(Here is|Here's|The JSON|The extracted|Based on|Output:).*?(\{|\[)/si, '$2')
    .replace(/```json\n?|\n?```/g, '')
    .replace(/<\/?extract>/g, '');
  
  // Try to find JSON object in the response
  const jsonMatch = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Found JSON-like structure but failed to parse:', jsonMatch[0]);
    }
  }
  
  // Last resort: try to extract key-value pairs manually
  const result = {};
  
  // Extract company
  const companyMatch = response.match(/"company"\s*:\s*"([^"]*)"/) || 
                       response.match(/company:\s*"([^"]*)"/) ||
                       response.match(/Company:\s*([^,\n}]+)/i);
  result.company = companyMatch ? companyMatch[1].trim() : null;
  
  // Extract position
  const positionMatch = response.match(/"position"\s*:\s*"([^"]*)"/) || 
                        response.match(/position:\s*"([^"]*)"/) ||
                        response.match(/Position:\s*([^,\n}]+)/i);
  result.position = positionMatch ? positionMatch[1].trim() : null;
  
  // Extract status
  const statusMatch = response.match(/"status"\s*:\s*"([^"]*)"/) || 
                      response.match(/status:\s*"([^"]*)"/) ||
                      response.match(/Status:\s*([^,\n}]+)/i);
  result.status = statusMatch ? normalizeStatus(statusMatch[1].trim()) : null;
  
  return result;
}

/**
 * Get all prompts for a model (used by frontend)
 */
function getModelPrompts(modelId) {
  return {
    stage1: getStage1Prompt(modelId),
    stage2: getStage2Prompt(modelId),
    stage3: getStage3Prompt(modelId)
  };
}

function resetToDefaults(modelId) {
  promptStore.delete(`${modelId}.stage1`);
  promptStore.delete(`${modelId}.stage2`);
  promptStore.delete(`${modelId}.stage3`);
  return { success: true };
}

// Cleanup function - clears models and contexts
async function cleanup() {
  console.log('Cleaning up loaded models and contexts');
  
  // Dispose all pooled contexts
  for (const pool of Object.values(contextPools)) {
    for (const [modelId, context] of pool) {
      try {
        await context.dispose();
        console.log(`Disposed context for ${modelId}`);
      } catch (e) {
        console.error(`Error disposing context for ${modelId}:`, e);
      }
    }
    pool.clear();
  }
  
  // Clear model cache
  loadedModels.clear();
}

module.exports = {
  classifyTwoStage,
  classifyStage1,
  extractStage2,
  extractStage2Batch,  // Add batch extraction
  matchJobs,
  getStage1Prompt,
  getStage2Prompt,
  getStage3Prompt,
  getModelPrompts,
  saveStage1Prompt,
  saveStage2Prompt,
  saveStage3Prompt,
  resetToDefaults,
  cleanup,
  getCacheStats,  // Add cache statistics
  // Export defaults so "Reset to Defaults" works in UI
  DEFAULT_STAGE1_PROMPTS: OPTIMIZED_STAGE1_PROMPTS,
  DEFAULT_STAGE2_PROMPTS: OPTIMIZED_STAGE2_PROMPTS,
  DEFAULT_STAGE3_PROMPTS: OPTIMIZED_STAGE3_PROMPTS
};