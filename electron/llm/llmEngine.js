"use strict";
/**
 * Local LLM engine for email classification
 * Uses lazy-loaded node-llama-cpp with singleton pattern
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEmailWithLLM = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("./config");
const cache_1 = require("./cache");
const prompts_1 = require("./prompts");
const normalize_1 = require("./normalize");
// Module-level singletons (lazy loaded)
let llamaModule = null;
let llamaInstance = null;
let loadedModel = null;
let loadedContext = null;
let loadedSession = null;
let loadedModelPath = null;
let concurrentRequests = 0;
const MAX_CONCURRENT_REQUESTS = 2;
async function initializeLLM() {
    const currentModelPath = path.resolve(config_1.ONLYJOBS_MODEL_PATH);
    // Check if already initialized with current model
    if (llamaInstance && loadedModel && loadedContext && loadedSession && loadedModelPath === currentModelPath) {
        return;
    }
    // Model path changed, need to reload
    if (loadedModelPath && loadedModelPath !== currentModelPath) {
        console.log(`🔄 Model path changed from ${loadedModelPath} to ${currentModelPath}, reloading...`);
        loadedModel = null;
        loadedContext = null;
        loadedSession = null;
    }
    try {
        // Lazy import node-llama-cpp (ONLY here) - use dynamic import for ESM
        if (!llamaModule) {
            console.log('🧠 Loading node-llama-cpp...');
            llamaModule = await import('node-llama-cpp');
        }
        // Check if model file exists
        if (!fs.existsSync(currentModelPath)) {
            throw new Error(`Model file not found: ${currentModelPath}`);
        }
        // Get getLlama function (handle different export patterns)
        const getLlama = llamaModule.getLlama || (llamaModule.default && llamaModule.default.getLlama);
        if (!getLlama) {
            throw new Error('node-llama-cpp getLlama() not available');
        }
        // Initialize llama instance if not done already
        if (!llamaInstance) {
            console.log('🔧 Initializing llama.cpp...');
            llamaInstance = await getLlama();
        }
        // Load model if not already loaded or path changed
        if (!loadedModel || loadedModelPath !== currentModelPath) {
            console.log(`🔧 Loading model from: ${currentModelPath}`);
            loadedModel = await llamaInstance.loadModel({
                modelPath: currentModelPath,
                gpuLayers: config_1.ONLYJOBS_N_GPU_LAYERS
            });
            loadedModelPath = currentModelPath;
        }
        // Create context if not already created
        if (!loadedContext) {
            console.log(`🧮 Creating context (ctx=${config_1.ONLYJOBS_CTX})...`);
            loadedContext = await loadedModel.createContext({
                contextSize: config_1.ONLYJOBS_CTX
            });
        }
        // Create chat session if not already created
        if (!loadedSession) {
            console.log('💬 Creating chat session...');
            loadedSession = new llamaModule.LlamaChatSession({
                contextSequence: loadedContext.getSequence()
            });
        }
        console.log('✅ LLM initialized successfully');
    }
    catch (error) {
        console.error('❌ Failed to initialize LLM:', error);
        // Clean up partial state
        llamaInstance = null;
        loadedModel = null;
        loadedContext = null;
        loadedSession = null;
        loadedModelPath = null;
        throw error;
    }
}
function parseJsonResponse(response) {
    let jsonText = response.trim();
    // Try to parse directly first
    try {
        const parsed = JSON.parse(jsonText);
        return validateAndFixParseResult(parsed);
    }
    catch (firstError) {
        // Try balanced-brace extraction
        const extracted = extractJsonWithBalancedBraces(jsonText);
        if (extracted) {
            try {
                const parsed = JSON.parse(extracted);
                return validateAndFixParseResult(parsed);
            }
            catch (secondError) {
                // Try simple repair on extracted JSON
                const repaired = repairJson(extracted);
                if (repaired) {
                    try {
                        const parsed = JSON.parse(repaired);
                        console.log('🔧 JSON repair successful');
                        return validateAndFixParseResult(parsed);
                    }
                    catch (thirdError) {
                        console.warn('JSON repair failed:', thirdError.message);
                    }
                }
            }
        }
        // Fallback: regex extraction
        const jsonMatch = jsonText.match(/\{[^}]*\}/s);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return validateAndFixParseResult(parsed);
            }
            catch (regexError) {
                console.warn('Regex extraction also failed');
            }
        }
        // Last resort failed
        console.warn('Could not parse JSON response after repair attempts');
        console.warn('Raw response:', response);
        throw new Error(`Failed to parse LLM response as JSON: ${firstError.message}`);
    }
}
function repairJson(jsonText) {
    try {
        // Common repairs: trailing commas, unquoted keys, single quotes
        let repaired = jsonText
            .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
            .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
            .replace(/'/g, '"'); // Convert single quotes to double quotes
        return repaired;
    }
    catch (error) {
        return null;
    }
}
function extractJsonWithBalancedBraces(text) {
    let depth = 0;
    let startIdx = -1;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (depth === 0) startIdx = i;
            depth++;
        }
        else if (text[i] === '}') {
            depth--;
            if (depth === 0 && startIdx >= 0) {
                return text.slice(startIdx, i + 1);
            }
        }
    }
    return null;
}
function isParsableStrictJSON(text) {
    try {
        const parsed = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null;
    }
    catch {
        return false;
    }
}
function performInferenceWithEarlyStop(session, fullPrompt) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        let depth = 0;
        let started = false;
        let completed = false;
        try {
            const completion = session.prompt(fullPrompt, {
                temperature: config_1.ONLYJOBS_TEMPERATURE,
                maxTokens: config_1.ONLYJOBS_MAX_TOKENS,
                onToken: (chunk) => {
                    if (completed) return;
                    const token = typeof chunk === 'string' ? chunk : chunk.token || chunk.text || String(chunk);
                    buffer += token;
                    // Track JSON brace depth
                    for (const char of token) {
                        if (char === '{') {
                            depth++;
                            started = true;
                        }
                        else if (char === '}') {
                            depth--;
                        }
                    }
                    // Check for complete JSON object
                    if (started && depth === 0) {
                        const startIdx = buffer.indexOf('{');
                        const endIdx = buffer.lastIndexOf('}');
                        if (startIdx >= 0 && endIdx > startIdx) {
                            const candidateJson = buffer.slice(startIdx, endIdx + 1);
                            if (isParsableStrictJSON(candidateJson)) {
                                completed = true;
                                resolve({ response: candidateJson, decisionPath: 'llm_success_early_stop' });
                                return;
                            }
                        }
                    }
                }
            });
            // Handle completion without early stop
            completion.then((fullResponse) => {
                if (!completed) {
                    resolve({ response: fullResponse, decisionPath: 'llm_success' });
                }
            }).catch((error) => {
                if (!completed) {
                    reject(error);
                }
            });
        }
        catch (error) {
            reject(error);
        }
    });
}
function performStandardInference(session, fullPrompt) {
    return session.prompt(fullPrompt, {
        temperature: config_1.ONLYJOBS_TEMPERATURE,
        maxTokens: config_1.ONLYJOBS_MAX_TOKENS,
    }).then(response => ({ response, decisionPath: 'llm_success' }));
}
function validateAndFixParseResult(obj) {
    // Ensure required fields exist with correct types
    const result = {
        is_job_related: Boolean(obj.is_job_related),
        company: obj.company && typeof obj.company === 'string' ? obj.company : null,
        position: obj.position && typeof obj.position === 'string' ? obj.position : null,
        status: null,
        confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.5
    };
    // Validate status field
    const validStatuses = ['Applied', 'Interview', 'Declined', 'Offer'];
    if (obj.status && validStatuses.includes(obj.status)) {
        result.status = obj.status;
    }
    return result;
}
function applyPrefilter(subject, plaintext, fromAddress) {
    if (!config_1.ONLYJOBS_ENABLE_PREFILTER) {
        return true; // Pass through if prefilter disabled
    }
    // Enhanced billing domain detection
    const domain = fromAddress ? (fromAddress.split('@')[1] || '') : '';
    const subjectLower = subject.toLowerCase();
    // Deny billing domains unless subject has strong job cues
    if (/(billpay|billing|invoice|statement|payment)/i.test(domain)) {
        const hasJobCues = /\b(job|application|applied|interview|offer|candidate|position|role|hiring)\b/i.test(subjectLower);
        if (!hasJobCues) {
            console.log(`🔍 Prefilter: SKIP (billing domain: ${domain}, no job cues in subject)`);
            return false;
        }
    }
    const combined = `${subject} ${plaintext}`.toLowerCase();
    const regex = new RegExp(config_1.ONLYJOBS_PREFILTER_REGEX, 'i');
    const matches = regex.test(combined);
    // Require both job tokens AND subject has strong indicators
    if (matches) {
        const subjectHasJobTokens = /\b(application|applied|interview|offer|candidate|position|role|hiring)\b/i.test(subjectLower);
        if (!subjectHasJobTokens) {
            console.log(`🔍 Prefilter: SKIP (content has job tokens but subject lacks indicators)`);
            return false;
        }
    }
    console.log(`🔍 Prefilter: ${matches ? 'PASS' : 'SKIP'} (regex: ${config_1.ONLYJOBS_PREFILTER_REGEX})`);
    return matches;
}
function truncateContent(plaintext) {
    if (plaintext.length <= config_1.ONLYJOBS_INFER_MAX_CHARS) {
        return plaintext;
    }
    const keepEnd = 800;
    const keepStart = config_1.ONLYJOBS_INFER_MAX_CHARS - keepEnd - 10; // 10 for separator
    const start = plaintext.substring(0, keepStart);
    const end = plaintext.substring(plaintext.length - keepEnd);
    const truncated = `${start}\n...\n${end}`;
    console.log(`✂️ Truncated content: ${plaintext.length} -> ${truncated.length} chars`);
    return truncated;
}
async function withTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
        })
    ]);
}
async function parseEmailWithLLM(input) {
    const startTime = Date.now();
    let decisionPath = '';
    try {
        // Concurrency guard
        if (concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
            console.warn(`⚠️ Too many concurrent requests (${concurrentRequests}), falling back to keyword`);
            const keywordProvider = await Promise.resolve().then(() => __importStar(require('../classifier/providers/keywordProvider')));
            return keywordProvider.parse(input);
        }
        concurrentRequests++;
        try {
            // Check cache first
            const cached = (0, cache_1.getCachedResult)(input.subject, input.plaintext);
            if (cached) {
                decisionPath = 'cache_hit';
                console.log(`⚡ ${decisionPath} (${Date.now() - startTime}ms)`);
                return cached;
            }
            // Apply prefilter
            if (!applyPrefilter(input.subject, input.plaintext, input.fromAddress)) {
                decisionPath = 'prefilter_skip';
                console.log(`⚡ ${decisionPath} (${Date.now() - startTime}ms)`);
                const keywordProvider = await Promise.resolve().then(() => __importStar(require('../classifier/providers/keywordProvider')));
                return keywordProvider.parse(input);
            }
            
            // Initialize LLM
            await initializeLLM();
            
            if (!loadedSession) {
                throw new Error('Chat session not available');
            }
            
            // Truncate content if needed
            const truncatedContent = truncateContent(input.plaintext);
            const userMessage = (0, prompts_1.userPrompt)(input.subject, truncatedContent);
            
            // Build single plain-string prompt 
            const fullPrompt = `${prompts_1.SYSTEM_PROMPT}\n\n${userMessage}`;
            
            console.log(`🧠 Querying LLM (promptChars=${fullPrompt.length})...`);
            
            // Run inference with streaming early-stop if enabled
            const inferenceResult = await withTimeout(
                config_1.ONLYJOBS_EARLY_STOP_JSON ? 
                    performInferenceWithEarlyStop(loadedSession, fullPrompt) :
                    performStandardInference(loadedSession, fullPrompt),
                config_1.ONLYJOBS_INFER_TIMEOUT_MS
            );
            
            console.log('📝 LLM response:', inferenceResult.response);
            
            const parsedResult = parseJsonResponse(inferenceResult.response);
            decisionPath = inferenceResult.decisionPath;
            
            // Apply normalization
            parsedResult.status = normalize_1.normalizeStatus(parsedResult.status);
            parsedResult.company = normalize_1.cleanText(parsedResult.company);
            parsedResult.position = normalize_1.cleanText(parsedResult.position);
            parsedResult.is_job_related = Boolean(parsedResult.is_job_related);
            parsedResult.confidence = typeof parsedResult.confidence === 'number' ? 
                Math.max(0, Math.min(1, parsedResult.confidence)) : 0.5;
            
            
            // Cache the result
            (0, cache_1.setCachedResult)(input.subject, input.plaintext, parsedResult);
            
            console.log(`✅ ${decisionPath} (${Date.now() - startTime}ms)`, parsedResult);
            
            // Periodic cache cleanup
            if (Math.random() < 0.1) { // 10% chance
              (0, cache_1.cleanupExpiredCache)();
            }
            
            return parsedResult;
        }
        finally {
            concurrentRequests--;
        }
    }
    catch (error) {
        const errorTime = Date.now() - startTime;
        if (error.message.includes('timed out')) {
            decisionPath = 'timeout_fallback';
            console.warn(`⏱️ ${decisionPath} (${errorTime}ms):`, error.message);
        }
        else if (error.message.includes('parse') || error.message.includes('JSON')) {
            decisionPath = 'parse_fail_fallback';
            console.warn(`🔧 ${decisionPath} (${errorTime}ms):`, error.message);
        }
        else {
            decisionPath = 'llm_error_fallback';
            console.error(`❌ ${decisionPath} (${errorTime}ms):`, error);
        }
        // Fallback to keyword provider
        const keywordProvider = await Promise.resolve().then(() => __importStar(require('../classifier/providers/keywordProvider')));
        const result = await keywordProvider.parse(input);
        console.log(`🔄 Fallback result (${Date.now() - startTime}ms):`, result);
        return result;
    }
}
exports.parseEmailWithLLM = parseEmailWithLLM;
