const crypto = require('crypto');
const path = require('path');
const { LLM_TEMPERATURE, LLM_MAX_TOKENS, LLM_CONTEXT, GPU_LAYERS } = require('./config');

// Track loaded models and sessions
const loadedModels = new Map();
const loadedSessions = new Map();

// Common JSON schema for all models
const schema = {
  type: "object",
  properties: {
    is_job_related: { type: "boolean" },
    company: { type: ["string", "null"] },
    position: { type: ["string", "null"] },
    status: { type: ["string", "null"], enum: ["Applied", "Interview", "Declined", "Offer", null] },
  },
  required: ["is_job_related", "company", "position", "status"],
  additionalProperties: false,
};

// Model-specific prompts (can be tweaked per model)
const MODEL_PROMPTS = {
  'phi-3.5-mini': `You are a job email classifier. Output ONLY valid JSON matching this exact schema, with no additional text:
{"is_job_related": boolean, "company": string|null, "position": string|null, "status": "Applied"|"Interview"|"Declined"|"Offer"|null}

Rules:
- If not job-related: set is_job_related=false and all other fields to null
- If job-related: extract company name (not ATS platform), position title (without job codes), and status
- Map ATS domains: *@myworkday.com → extract company from email body
- Never use "unknown" - use null if uncertain
- Output ONLY the JSON object, no explanations`,

  'llama-3.2-3b': `You are a JSON-only email classifier for job applications.

CRITICAL: Output ONLY a JSON object. No other text allowed.

Schema: {"is_job_related": boolean, "company": string|null, "position": string|null, "status": string|null}

Classification rules:
1. Job-related = job applications, interviews, offers, rejections from companies
2. Not job-related = newsletters, GitHub, personal emails
3. Extract real company name (not Workday/Greenhouse)
4. Remove job codes from positions (R196209 Data Analyst → Data Analyst)
5. Status values: Applied, Interview, Declined, Offer, or null

Output JSON only:`,

  'qwen2.5-3b': `Task: Classify email and extract job information as JSON.

Output format (strict JSON only):
{"is_job_related": boolean, "company": string|null, "position": string|null, "status": string|null}

Instructions:
- Determine if email is about a job opportunity
- Extract company (actual employer, not ATS system)  
- Extract position (clean title without codes)
- Detect status: Applied/Interview/Declined/Offer/null
- Use null for unknown values, never "unknown"
- Output pure JSON, no additional text

JSON output:`
};

async function loadLlamaModule() {
  try {
    return await import('node-llama-cpp');
  } catch (error) {
    throw new Error("node-llama-cpp is not installed or failed to build");
  }
}

async function ensureModelLoaded(modelId, modelPath) {
  if (loadedModels.has(modelId)) {
    return loadedModels.get(modelId);
  }
  
  console.log(`MultiModel: Loading model ${modelId} from ${modelPath}`);
  
  const fs = require('fs');
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }
  
  const stats = fs.statSync(modelPath);
  console.log(`MultiModel: Model file size: ${stats.size} bytes`);
  
  const module = await loadLlamaModule();
  const { getLlama } = module;
  
  try {
    const llama = await getLlama();
    const model = await llama.loadModel({ 
      modelPath,
      gpuLayers: GPU_LAYERS || 0
    });
    
    loadedModels.set(modelId, model);
    console.log(`MultiModel: Model ${modelId} loaded successfully`);
    return model;
  } catch (error) {
    console.error(`MultiModel: Error loading model ${modelId}:`, error);
    throw error;
  }
}

async function ensureSession(modelId, modelPath) {
  const sessionKey = modelId;
  
  if (loadedSessions.has(sessionKey)) {
    return loadedSessions.get(sessionKey);
  }
  
  const model = await ensureModelLoaded(modelId, modelPath);
  const module = await loadLlamaModule();
  const { LlamaContext, LlamaChatSession } = module;
  
  console.log(`MultiModel: Creating session for ${modelId}`);
  
  const context = await model.createContext({ 
    contextSize: LLM_CONTEXT, 
    batchSize: 512 
  });
  
  const systemPrompt = MODEL_PROMPTS[modelId] || MODEL_PROMPTS['phi-3.5-mini'];
  
  const sequence = context.getSequence();
  const session = new LlamaChatSession({ 
    contextSequence: sequence, 
    systemPrompt: systemPrompt
  });
  
  loadedSessions.set(sessionKey, { session, context });
  console.log(`MultiModel: Session ready for ${modelId}`);
  
  return { session, context };
}

async function createCustomSession(modelId, modelPath, customPrompt, sessionKey) {
  // Dispose existing custom session if exists
  if (loadedSessions.has(sessionKey)) {
    const { context } = loadedSessions.get(sessionKey);
    if (context && context.dispose) {
      context.dispose();
    }
    loadedSessions.delete(sessionKey);
  }
  
  const model = await ensureModelLoaded(modelId, modelPath);
  const module = await loadLlamaModule();
  const { LlamaContext, LlamaChatSession } = module;
  
  console.log(`MultiModel: Creating custom session for ${modelId}`);
  
  const context = await model.createContext({ 
    contextSize: LLM_CONTEXT, 
    batchSize: 512 
  });
  
  const sequence = context.getSequence();
  const session = new LlamaChatSession({ 
    contextSequence: sequence, 
    systemPrompt: customPrompt
  });
  
  loadedSessions.set(sessionKey, { session, context });
  console.log(`MultiModel: Custom session ready for ${modelId}`);
  
  return { session, context };
}

async function classifyWithModel(modelId, modelPath, emailSubject, emailBody, options = {}) {
  const startTime = Date.now();
  
  try {
    let session, sessionKey;
    
    // If custom prompt provided, create a custom session
    if (options.customPrompt) {
      sessionKey = `${modelId}_custom_${Date.now()}`;
      await createCustomSession(modelId, modelPath, options.customPrompt, sessionKey);
      ({ session } = loadedSessions.get(sessionKey));
    } else {
      // Use default session
      ({ session } = await ensureSession(modelId, modelPath));
    }
    
    const temperature = options.temperature ?? LLM_TEMPERATURE;
    const maxTokens = options.maxTokens ?? LLM_MAX_TOKENS;
    
    // Truncate email to prevent context overflow
    const maxBodyLength = 1500;
    const truncatedBody = emailBody.length > maxBodyLength 
      ? emailBody.substring(0, maxBodyLength) + "... [truncated]"
      : emailBody;
    
    const userPrompt = [
      `Email to classify:`,
      `Subject: ${emailSubject}`,
      `Body: ${truncatedBody}`
    ].join("\n");
    
    console.log(`MultiModel: Processing with ${modelId}...`);
    
    const response = await session.prompt(userPrompt, {
      temperature,
      maxTokens,
      responseFormat: {
        type: "json_schema",
        schema,
        schema_id: "JobEmailClassification",
      },
    });
    
    const processingTime = Date.now() - startTime;
    console.log(`MultiModel: ${modelId} responded in ${processingTime}ms`);
    
    // Parse response
    let parsed;
    try {
      // Validate JSON format
      if (!response || !response.trim().startsWith('{')) {
        throw new Error('Response is not JSON');
      }
      
      parsed = JSON.parse(response);
      
      // Enforce schema rules
      if (!parsed.is_job_related) {
        parsed.company = null;
        parsed.position = null;
        parsed.status = null;
      }
      
      // Clean up any "unknown" values
      if (parsed.company === 'unknown') parsed.company = null;
      if (parsed.position === 'unknown') parsed.position = null;
      
    } catch (parseError) {
      console.error(`MultiModel: ${modelId} returned invalid JSON:`, response);
      parsed = { 
        is_job_related: false, 
        company: null, 
        position: null, 
        status: null,
        error: 'Invalid JSON response'
      };
    }
    
    // Clean up custom session if used
    if (options.customPrompt && sessionKey) {
      const { context } = loadedSessions.get(sessionKey) || {};
      if (context && context.dispose) {
        context.dispose();
      }
      loadedSessions.delete(sessionKey);
    }
    
    return {
      modelId,
      result: parsed,
      processingTime,
      rawResponse: response
    };
    
  } catch (error) {
    console.error(`MultiModel: Error with ${modelId}:`, error);
    
    // Clean up custom session on error
    if (options.customPrompt && sessionKey) {
      const { context } = loadedSessions.get(sessionKey) || {};
      if (context && context.dispose) {
        context.dispose();
      }
      loadedSessions.delete(sessionKey);
    }
    
    return {
      modelId,
      result: {
        is_job_related: false,
        company: null,
        position: null,
        status: null,
        error: error.message
      },
      processingTime: Date.now() - startTime,
      rawResponse: null,
      error: error.message
    };
  }
}

async function classifyWithAllModels(models, emailSubject, emailBody, options = {}) {
  console.log(`MultiModel: Running comparison across ${models.length} models`);
  
  // Run all models in parallel
  const promises = models.map(({ modelId, modelPath }) => 
    classifyWithModel(modelId, modelPath, emailSubject, emailBody, options)
  );
  
  const results = await Promise.all(promises);
  
  return {
    subject: emailSubject,
    results,
    timestamp: new Date().toISOString()
  };
}

// Cleanup function to free memory
async function cleanup() {
  console.log('MultiModel: Cleaning up loaded models and sessions');
  
  // Dispose contexts
  for (const [key, { context }] of loadedSessions) {
    try {
      if (context && context.dispose) {
        context.dispose();
      }
    } catch (e) {
      console.error(`Error disposing context for ${key}:`, e);
    }
  }
  
  loadedSessions.clear();
  loadedModels.clear();
}

// Function to get default prompt for a model
function getDefaultPrompt(modelId) {
  return MODEL_PROMPTS[modelId] || MODEL_PROMPTS['phi-3.5-mini'];
}

// Function to get all default prompts
function getAllDefaultPrompts() {
  return MODEL_PROMPTS;
}

module.exports = {
  classifyWithModel,
  classifyWithAllModels,
  cleanup,
  getDefaultPrompt,
  getAllDefaultPrompts,
  MODEL_PROMPTS
};