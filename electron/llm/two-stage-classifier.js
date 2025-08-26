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

// Store for saving model-specific prompts
const promptStore = new Store({ name: 'model-prompts' });

// Single global model cache - models are expensive to load (60+ seconds)
const loadedModels = new Map();

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
 * Create a lightweight, single-use context
 */
async function createLightweightContext(model, contextSize) {
  return await model.createContext({ 
    contextSize,
    batchSize: 128  // Small batch size for efficiency
  });
}

/**
 * Stage 1: Fast binary classification (stateless)
 */
async function classifyStage1(modelId, modelPath, emailSubject, emailBody) {
  const startTime = Date.now();
  
  try {
    // Get model (cached after first load)
    const model = await ensureModelLoaded(modelId, modelPath);
    
    // Create lightweight context just for this classification
    const context = await createLightweightContext(model, STAGE1_CONTEXT_SIZE);
    
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
      
      const sequence = context.getSequence();
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
      const response = await session.prompt(userPrompt, {
        temperature: 0,
        maxTokens: STAGE1_MAX_TOKENS
      });
      
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
      // ALWAYS dispose context
      context.dispose();
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
    
    // Create lightweight context for extraction
    const context = await createLightweightContext(model, STAGE2_CONTEXT_SIZE);
    
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
      
      const sequence = context.getSequence();
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
      // ALWAYS dispose context
      context.dispose();
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
    
    // Create lightweight context for matching
    const context = await createLightweightContext(model, STAGE3_CONTEXT_SIZE);
    
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
      
      const sequence = context.getSequence();
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
      // ALWAYS dispose context
      context.dispose();
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
async function classifyTwoStage(modelId, modelPath, emailSubject, emailBody) {
  const startTime = Date.now();
  
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

// Simple cleanup - just clear model cache if needed
async function cleanup() {
  console.log('Cleaning up loaded models');
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