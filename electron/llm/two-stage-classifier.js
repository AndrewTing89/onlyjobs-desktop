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
  stage1: new Map(), // modelId -> context
  stage2: new Map(), // modelId -> context  
  stage3: new Map()  // modelId -> context
};

// Optimized Stage 1 prompts - ultra concise
const OPTIMIZED_STAGE1_PROMPTS = {
  'llama-3-8b-instruct-q5_k_m': 'Job-related email? Output only: {"is_job":true} or {"is_job":false}',
  'qwen2.5-7b-instruct-q5_k_m': 'Job email? Reply: {"is_job":boolean}',
  'qwen2.5-3b-instruct-q5_k_m': 'Job? {"is_job":bool}',
  'phi-3.5-mini-instruct-q5_k_m': 'Job application/interview/offer? {"is_job":bool}',
  'hermes-3-llama-3.1-8b-q5_k_m': 'Is job-related? {"is_job":true/false}',
  'hermes-2-pro-mistral-7b-q5_k_m': '<job_check>{"is_job":boolean}</job_check>'
};

// Optimized Stage 2 prompts - direct extraction
const OPTIMIZED_STAGE2_PROMPTS = {
  'llama-3-8b-instruct-q5_k_m': `Extract: {"company":string,"position":string,"status":"Applied"|"Interview"|"Declined"|"Offer"}
Use null for unknown fields.`,
  
  'qwen2.5-7b-instruct-q5_k_m': 'Extract job details as JSON: company, position, status(Applied/Interview/Declined/Offer)',
  
  'qwen2.5-3b-instruct-q5_k_m': 'Output: {"company":str,"position":str,"status":str}',
  
  'phi-3.5-mini-instruct-q5_k_m': 'JSON: company, position, status only',
  
  'hermes-3-llama-3.1-8b-q5_k_m': 'Extract company/position/status as JSON. Use null for unknown.',
  
  'hermes-2-pro-mistral-7b-q5_k_m': '<extract>{"company":str,"position":str,"status":str}</extract>'
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
  
  // Force new context if requested or if context doesn't exist
  if (forceNew || !pool.has(modelId)) {
    // Dispose old context if forcing new
    if (forceNew && pool.has(modelId)) {
      console.log(`🔄 Disposing exhausted ${stage} context for ${modelId}`);
      try {
        const oldContext = pool.get(modelId);
        oldContext.dispose();
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
    pool.set(modelId, context);
    console.log(`✅ Context created and pooled for ${stage}/${modelId}`);
  } else {
    console.log(`♻️ REUSING existing ${stage} context for ${modelId}`);
  }
  
  return pool.get(modelId);
}

/**
 * Stage 1: Fast binary classification (stateless)
 */
async function classifyStage1(modelId, modelPath, emailSubject, emailBody) {
  const startTime = Date.now();
  
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
      
      return {
        is_job: isJob,
        stage1Time: processingTime,
        rawResponse: response
      };
      
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
      
      // Parse extraction
      let result = { company: null, position: null, status: null };
      try {
        const cleanResponse = response.trim()
          .replace(/```json\n?|\n?```/g, '')
          .replace(/<\/?extract>/g, '');
        const parsed = JSON.parse(cleanResponse);
        
        result.company = parsed.company || null;
        result.position = parsed.position || null;
        result.status = parsed.status || null;
        
        // Normalize status values
        if (result.status) {
          const statusLower = result.status.toLowerCase();
          if (statusLower.includes('declin') || statusLower.includes('reject')) {
            result.status = 'Declined';
          } else if (statusLower.includes('interview')) {
            result.status = 'Interview';
          } else if (statusLower.includes('offer')) {
            result.status = 'Offer';
          } else {
            result.status = 'Applied';
          }
        }
      } catch (e) {
        console.error('Failed to parse Stage 2 response:', e);
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`⚡ Stage 2 completed in ${processingTime}ms - Extracted: ${result.company} / ${result.position}`);
      
      return {
        ...result,
        stage2Time: processingTime,
        rawResponse: response
      };
      
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
      
      return {
        same_job: sameJob,
        processingTime,
        rawResponse: response
      };
      
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
  
  // Stage 0: ML Pre-classification (1ms)
  const mlClassifier = getMLClassifier();
  const mlResult = await mlClassifier.classify(emailSubject, emailBody, emailSender);
  
  // If ML has high confidence, skip LLM Stage 1
  if (mlResult.confidence >= 0.9) {
    console.log(`🚀 ML Stage 0: High confidence (${mlResult.confidence.toFixed(2)}) - ${mlResult.is_job_related ? 'Job' : 'Not job'}`);
    
    if (!mlResult.is_job_related) {
      // High confidence non-job - skip all LLM stages
      return {
        is_job: false,
        company: null,
        position: null,
        status: null,
        totalTime: Date.now() - startTime,
        mlSkipped: true,
        confidence: mlResult.confidence
      };
    }
    
    // High confidence job - skip Stage 1, go directly to Stage 2
    console.log(`⚡ ML detected job email with high confidence - skipping LLM Stage 1`);
    const stage2Result = await extractStage2(modelId, modelPath, emailSubject, emailBody);
    
    return {
      is_job: true,
      ...stage2Result,
      totalTime: Date.now() - startTime,
      mlSkipped: true,
      confidence: mlResult.confidence
    };
  }
  
  // Low/medium confidence - use LLM Stage 1 for verification
  console.log(`🤔 ML Stage 0: Medium confidence (${mlResult.confidence.toFixed(2)}) - using LLM verification`);
  
  // Stage 1: Fast binary classification
  const stage1Result = await classifyStage1(modelId, modelPath, emailSubject, emailBody);
  
  if (!stage1Result.is_job) {
    // Early exit for non-job emails (majority of emails)
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
  
  // Stage 2: Extract details (only for job emails)
  const stage2Result = await extractStage2(modelId, modelPath, emailSubject, emailBody);
  
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
  // Export defaults so "Reset to Defaults" works in UI
  DEFAULT_STAGE1_PROMPTS: OPTIMIZED_STAGE1_PROMPTS,
  DEFAULT_STAGE2_PROMPTS: OPTIMIZED_STAGE2_PROMPTS,
  DEFAULT_STAGE3_PROMPTS: OPTIMIZED_STAGE3_PROMPTS
};