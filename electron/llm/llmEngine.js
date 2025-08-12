"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEmailWithLLM = exports.DEFAULT_SYSTEM_PROMPT = void 0;
const crypto_1 = require("crypto");
const config_1 = require("./config");
const rules_1 = require("./rules");
const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

// We import lazily since node-llama-cpp is heavy
let llamaModule = null;
let loadedSession = null; // LlamaChatSession
let loadedContext = null; // LlamaContext
let loadedModel = null; // LlamaModel
let loadedModelPath = null;
let currentSystemPrompt = null; // Track current prompt to detect changes
async function loadLlamaModule() {
    if (llamaModule)
        return llamaModule;
    try {
        llamaModule = await import('node-llama-cpp');
        return llamaModule;
    }
    catch (error) {
        throw new Error("node-llama-cpp is not installed or failed to build. Run: npm i node-llama-cpp --legacy-peer-deps (or with --build-from-source)");
    }
}
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
// Default system prompt (fallback if no custom prompt exists)
const DEFAULT_SYSTEM_PROMPT = exports.DEFAULT_SYSTEM_PROMPT = [
    "You are an email parser. Output ONLY JSON matching the schema, with no extra text.",
    "Decide if the email is job-related (job application, recruiting, ATS, interview, offer, rejection, etc.).",
    "If not job-related → is_job_related=false, and company=null, position=null, status=null.",
    "If job-related, extract:",
    "- company: prefer official name from body; map ATS domains (pnc@myworkday.com → PNC).",
    "- position: strip job codes (R196209 Data Analyst → Data Analyst).",
    "- status: Applied | Interview | Declined | Offer; if uncertain use null.",
    "Never use 'unknown' - use null per schema.",
    "",
    "Examples:",
    "Input: Subject: Application received – Data Analyst\\nBody: Thanks for applying to Acme for Data Analyst.",
    '{"is_job_related":true,"company":"Acme","position":"Data Analyst","status":"Applied"}',
    "",
    "Input: Subject: Interview – Globex\\nBody: Schedule interview for your Globex application.",
    '{"is_job_related":true,"company":"Globex","position":null,"status":"Interview"}',
    "",
    "Input: Subject: Your application\\nBody: We regret to inform you we will not move forward at Initech.",
    '{"is_job_related":true,"company":"Initech","position":null,"status":"Declined"}',
    "",
    "Input: Subject: Career newsletter\\nBody: Industry news and career advice.",
    '{"is_job_related":false,"company":null,"position":null,"status":null}',
].join("\n");

// Load custom prompt or fallback to default
async function loadSystemPrompt() {
    try {
        const promptPath = path.join(app.getPath('userData'), 'classificationPrompt.txt');
        const customPrompt = await fs.readFile(promptPath, 'utf-8');
        console.log('LLM: Using custom classification prompt');
        return customPrompt;
    } catch (error) {
        // Custom prompt doesn't exist, use default
        console.log('LLM: Using default classification prompt');
        return DEFAULT_SYSTEM_PROMPT;
    }
}
const cache = new Map();
function makeCacheKey(subject, plaintext) {
    const canonical = subject + "\n" + plaintext.slice(0, 1000);
    return crypto_1.createHash("sha256").update(canonical).digest("hex");
}
async function ensureSession(modelPath) {
    // Load the current system prompt
    const systemPrompt = await loadSystemPrompt();
    
    // Check if we need to recreate session due to prompt change
    if (loadedSession && loadedModelPath === modelPath && currentSystemPrompt === systemPrompt) {
        return loadedSession;
    }
    
    // If only the prompt changed, we can reuse the model and context
    if (loadedModel && loadedContext && loadedModelPath === modelPath && currentSystemPrompt !== systemPrompt) {
        console.log('LLM: Prompt changed, recreating session with new prompt...');
        const sequence = loadedContext.getSequence();
        const module = await loadLlamaModule();
        const { LlamaChatSession } = module;
        loadedSession = new LlamaChatSession({ 
            contextSequence: sequence, 
            systemPrompt: systemPrompt
        });
        currentSystemPrompt = systemPrompt;
        loadedModelPath = modelPath;
        console.log('LLM: Session recreated with updated prompt');
        return loadedSession;
    }
    
    console.log('LLM: Loading model from:', modelPath);
    const fsSync = require('fs');
    
    // Check if model file exists
    if (!fsSync.existsSync(modelPath)) {
        throw new Error(`Model file not found at: ${modelPath}`);
    }
    
    const stats = fsSync.statSync(modelPath);
    console.log('LLM: Model file size:', stats.size, 'bytes');
    
    const module = await loadLlamaModule();
    const { getLlama, LlamaModel, LlamaContext, LlamaChatSession } = module;
    
    try {
        const llama = await getLlama();
        console.log('LLM: Got llama instance, loading model...');
        
        loadedModel = await llama.loadModel({ 
            modelPath,
            gpuLayers: config_1.GPU_LAYERS || 0
        });
        
        console.log('LLM: Model loaded, creating context...');
        loadedContext = await loadedModel.createContext({ 
            contextSize: config_1.LLM_CONTEXT, 
            batchSize: 512 
        });
        
        console.log('LLM: Context created, creating session with prompt...');
        const sequence = loadedContext.getSequence();
        loadedSession = new LlamaChatSession({ 
            contextSequence: sequence, 
            systemPrompt: systemPrompt 
        });
        
        loadedModelPath = modelPath;
        console.log('LLM: Session ready');
        return loadedSession;
    } catch (error) {
        console.error('LLM: Detailed error loading model:', error);
        console.error('LLM: Error stack:', error.stack);
        throw error;
    }
}
async function parseEmailWithLLM(input) {
    const subject = input.subject ?? "";
    const plaintext = input.plaintext ?? "";
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? config_1.LLM_TEMPERATURE;
    const maxTokens = input.maxTokens ?? config_1.LLM_MAX_TOKENS;
    const key = makeCacheKey(subject, plaintext);
    const cached = cache.get(key);
    if (cached) {
        console.log('LLM: Using cached result for:', subject.substring(0, 50));
        return cached;
    }
    const session = await ensureSession(modelPath);
    const hint = (0, rules_1.getStatusHint)(subject, plaintext);
    // Truncate email content to prevent context overflow
    const maxBodyLength = 1500; // Reasonable limit for email classification
    const truncatedBody = plaintext.length > maxBodyLength 
        ? plaintext.substring(0, maxBodyLength) + "... [truncated]"
        : plaintext;
    
    const userPrompt = [
        hint ? `${hint}` : null,
        `Input`,
        `Subject: ${subject}`,
        `Body: ${truncatedBody}`,
        `Output`,
    ]
        .filter(Boolean)
        .join("\n");
    
    console.log('LLM: Processing email with subject:', subject.substring(0, 50));
    
    const response = await session.prompt(userPrompt, {
        temperature,
        maxTokens,
        responseFormat: {
            type: "json_schema",
            schema,
            schema_id: "OnlyJobsEmailParseSchema",
        },
    });
    
    console.log('LLM: Raw response:', response);
    
    // node-llama-cpp with responseFormat json_schema guarantees valid JSON matching schema
    // but we still defensively parse and coerce nulls instead of 'unknown'
    let parsed;
    try {
        parsed = JSON.parse(response);
        console.log('LLM: Parsed result:', parsed);
    }
    catch (err) {
        console.error('LLM: Failed to parse response:', err);
        // Should not happen with json_schema, but ensure hard fallback
        parsed = { is_job_related: false, company: null, position: null, status: null };
    }
    // Enforce rules: if not job-related, everything else null
    if (!parsed.is_job_related) {
        parsed.company = null;
        parsed.position = null;
        parsed.status = null;
    }
    // Never return 'unknown' strings
    if (parsed.company && /^unknown$/i.test(parsed.company))
        parsed.company = null;
    if (parsed.position && /^unknown$/i.test(parsed.position))
        parsed.position = null;
    cache.set(key, parsed);
    return parsed;
}
exports.parseEmailWithLLM = parseEmailWithLLM;
