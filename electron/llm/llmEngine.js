"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEmailWithLLM = exports.parseEmailWithTwoStage = exports.parseJobEmail = exports.classifyEmail = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("./config");
// Import performance monitoring
const { performanceMonitor } = require('./performance-monitor.js');
// Start auto-reporting (every 10 minutes in production)
performanceMonitor.startAutoReporting(10);
// We import lazily since node-llama-cpp is heavy
let llamaModule = null;
// Stage 1 (Classification) session - optimized for speed
let stage1Session = null; // LlamaChatSession
let stage1Context = null; // LlamaContext
// Stage 2 (Parsing) session - optimized for accuracy
let stage2Session = null; // LlamaChatSession
let stage2Context = null; // LlamaContext
// Unified session (backward compatibility)
let unifiedSession = null; // LlamaChatSession
let unifiedContext = null; // LlamaContext
// Shared model and path tracking
let loadedModel = null; // LlamaModel
let loadedModelPath = null;
// Session use counters to track when to reset
let stage1UseCount = 0;
let stage2UseCount = 0;
const MAX_SESSION_USES = 10; // Reuse sessions up to 10 times for efficiency (was 1)
// Session health tracking to detect disposal issues
let stage1SessionHealthy = true;
let stage2SessionHealthy = true;
async function loadLlamaModule() {
    if (llamaModule)
        return llamaModule;
    try {
        llamaModule = await Promise.resolve().then(() => __importStar(require('node-llama-cpp')));
        return llamaModule;
    }
    catch (error) {
        throw new Error("node-llama-cpp is not installed or failed to build. Run: npm i node-llama-cpp --legacy-peer-deps (or with --build-from-source)");
    }
}
const fullParseSchema = {
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
const classificationSchema = {
    type: "object",
    properties: {
        is_job_related: { type: "boolean" },
        manual_record_risk: { type: "string", enum: ["none", "low", "medium", "high"] }
    },
    required: ["is_job_related", "manual_record_risk"],
    additionalProperties: false,
};
// EMERGENCY: Absolute minimal prompts for 3B model - under 15 words each
const STAGE1_CLASSIFICATION_PROMPT = `Job application email? true/false`;
// EMERGENCY: Minimal Stage 2 prompt
const STAGE2_PARSING_PROMPT = `Extract: company, position, status`;
// Separate caches for different stages
const classificationCache = new Map();
const parseCache = new Map();
const unifiedCache = new Map();
function makeCacheKey(subject, plaintext) {
    const canonical = subject + "\n" + plaintext.slice(0, 1000);
    return crypto_1.default.createHash("sha256").update(canonical).digest("hex");
}
// Robust LLM response cleaning for JSON extraction
function cleanLLMResponse(response) {
    if (!response || typeof response !== 'string') {
        throw new Error('Invalid response: not a string');
    }
    // Remove common LLM prefixes and suffixes
    let cleaned = response
        .replace(/^assistant\s*\n?/i, '') // Remove "assistant" prefix
        .replace(/^```json\s*\n?/i, '') // Remove markdown json block start
        .replace(/\n?```\s*$/i, '') // Remove markdown json block end
        .replace(/^Here's the JSON:?\s*\n?/i, '') // Remove explanation prefixes
        .replace(/^The JSON response is:?\s*\n?/i, '') // Remove explanation prefixes
        .replace(/^JSON:?\s*\n?/i, '') // Remove "JSON:" prefix
        .trim();
    // Find the JSON object - look for first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
}
// Regex-based JSON extraction fallback
function extractJSONFromText(text) {
    if (!text)
        return null;
    // Multiple extraction strategies
    const patterns = [
        // Standard JSON object
        /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
        // JSON with nested quotes
        /\{(?:[^{}]|"[^"]*")*\}/g,
    ];
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
            for (const match of matches) {
                try {
                    const parsed = JSON.parse(match);
                    if (typeof parsed === 'object' && parsed !== null) {
                        return parsed;
                    }
                }
                catch {
                    continue;
                }
            }
        }
    }
    // Last resort: extract key-value pairs with regex
    const keyValueExtraction = {};
    // Extract boolean fields
    const booleanMatch = text.match(/"?is_job_related"?\s*:\s*(true|false)/i);
    if (booleanMatch) {
        keyValueExtraction.is_job_related = booleanMatch[1].toLowerCase() === 'true';
    }
    // Extract string fields
    const companyMatch = text.match(/"?company"?\s*:\s*"([^"]+)"/i);
    if (companyMatch) {
        keyValueExtraction.company = companyMatch[1];
    }
    const positionMatch = text.match(/"?position"?\s*:\s*"([^"]+)"/i);
    if (positionMatch) {
        keyValueExtraction.position = positionMatch[1];
    }
    const statusMatch = text.match(/"?status"?\s*:\s*"(Applied|Interview|Declined|Offer)"/i);
    if (statusMatch) {
        keyValueExtraction.status = statusMatch[1];
    }
    // Return if we found anything useful
    if (Object.keys(keyValueExtraction).length > 0) {
        return keyValueExtraction;
    }
    return null;
}
async function ensureModel(modelPath) {
    if (loadedModel && loadedModelPath === modelPath)
        return loadedModel;
    const module = await loadLlamaModule();
    const { getLlama } = module;
    const llama = await getLlama();
    loadedModel = await llama.loadModel({ modelPath });
    loadedModelPath = modelPath;
    return loadedModel;
}
// Stage 1: Fast classification session (small context, optimized for speed)
async function ensureStage1Session(modelPath) {
    const model = await ensureModel(modelPath);
    const module = await loadLlamaModule();
    const { LlamaContext, LlamaChatSession } = module;
    // Create context only if needed
    if (!stage1Context || loadedModelPath !== modelPath || !stage1SessionHealthy) {
        if (stage1Context) {
            try {
                stage1Context.dispose();
            }
            catch (e) {
                console.warn('Stage 1 context disposal warning:', e.message);
            }
        }
        stage1Context = await model.createContext({
            contextSize: config_1.STAGE1_CONTEXT,
            batchSize: 256
        });
        stage1SessionHealthy = true;
    }
    // Check session health and recreate if needed
    const needsReset = !stage1Session ||
        loadedModelPath !== modelPath ||
        stage1UseCount >= MAX_SESSION_USES ||
        !stage1SessionHealthy;
    if (needsReset) {
        if (stage1Session) {
            try {
                // EMERGENCY FIX: Check if session is already disposed before disposing
                if (stage1Session._context && !stage1Session._context.isDisposed) {
                    stage1Session.dispose();
                }
            }
            catch (e) {
                console.warn('Stage 1 session disposal warning:', e.message);
                stage1SessionHealthy = false;
            }
            stage1Session = null; // EMERGENCY FIX: Clear reference
        }
        try {
            const sequence = stage1Context.getSequence();
            stage1Session = new LlamaChatSession({
                contextSequence: sequence,
                systemPrompt: STAGE1_CLASSIFICATION_PROMPT
            });
            stage1UseCount = 0;
            stage1SessionHealthy = true;
            performanceMonitor.recordSessionEvent('creation', 1);
        }
        catch (e) {
            console.error('Stage 1 session creation failed:', e);
            stage1SessionHealthy = false;
            throw e;
        }
    }
    else {
        performanceMonitor.recordSessionEvent('reuse', 1);
    }
    stage1UseCount++;
    return stage1Session;
}
// Stage 2: Detailed parsing session (full context, optimized for accuracy)
async function ensureStage2Session(modelPath) {
    const model = await ensureModel(modelPath);
    const module = await loadLlamaModule();
    const { LlamaContext, LlamaChatSession } = module;
    // Create context only if needed
    if (!stage2Context || loadedModelPath !== modelPath || !stage2SessionHealthy) {
        if (stage2Context) {
            try {
                stage2Context.dispose();
            }
            catch (e) {
                console.warn('Stage 2 context disposal warning:', e.message);
            }
        }
        stage2Context = await model.createContext({
            contextSize: config_1.STAGE2_CONTEXT,
            batchSize: 512
        });
        stage2SessionHealthy = true;
    }
    // Check session health and recreate if needed
    const needsReset = !stage2Session ||
        loadedModelPath !== modelPath ||
        stage2UseCount >= MAX_SESSION_USES ||
        !stage2SessionHealthy;
    if (needsReset) {
        if (stage2Session) {
            try {
                // EMERGENCY FIX: Check if session is already disposed before disposing
                if (stage2Session._context && !stage2Session._context.isDisposed) {
                    stage2Session.dispose();
                }
            }
            catch (e) {
                console.warn('Stage 2 session disposal warning:', e.message);
                stage2SessionHealthy = false;
            }
            stage2Session = null; // EMERGENCY FIX: Clear reference
        }
        try {
            const sequence = stage2Context.getSequence();
            stage2Session = new LlamaChatSession({
                contextSequence: sequence,
                systemPrompt: STAGE2_PARSING_PROMPT
            });
            stage2UseCount = 0;
            stage2SessionHealthy = true;
            performanceMonitor.recordSessionEvent('creation', 2);
        }
        catch (e) {
            console.error('Stage 2 session creation failed:', e);
            stage2SessionHealthy = false;
            throw e;
        }
    }
    else {
        performanceMonitor.recordSessionEvent('reuse', 2);
    }
    stage2UseCount++;
    return stage2Session;
}
// Backward compatibility: Unified session
async function ensureUnifiedSession(modelPath) {
    if (unifiedSession && loadedModelPath === modelPath)
        return unifiedSession;
    const model = await ensureModel(modelPath);
    const module = await loadLlamaModule();
    const { LlamaContext, LlamaChatSession } = module;
    unifiedContext = await model.createContext({
        contextSize: config_1.LLM_CONTEXT,
        batchSize: 512
    });
    const sequence = unifiedContext.getSequence();
    unifiedSession = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: STAGE2_PARSING_PROMPT // Use full prompt for backward compatibility
    });
    return unifiedSession;
}
// Normalization and validation function
function normalizeAndValidateResult(parsed, context) {
    // Enforce schema rules
    if (!parsed.is_job_related) {
        parsed.company = null;
        parsed.position = null;
        parsed.status = null;
        return parsed;
    }
    // Clean up "unknown" values - LLM should not produce these but safety check
    if (parsed.company && /^(unknown|n\/a|null|undefined|unclear)$/i.test(parsed.company)) {
        parsed.company = null;
    }
    if (parsed.position && /^(unknown|n\/a|null|undefined|unclear)$/i.test(parsed.position)) {
        parsed.position = null;
    }
    // Enhanced position validation - catch corrupted extractions
    if (parsed.position) {
        // Remove any remaining job codes that slipped through
        parsed.position = parsed.position
            .replace(/\b[A-Z]*\d+[A-Z]*\w*\b/g, '') // Remove alphanumeric codes
            .replace(/\([^)]*\d[^)]*\)/g, '') // Remove parenthetical content with numbers
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        // Validate the cleaned position isn't corrupted
        if (parsed.position.length < 3 ||
            /^[A-Z]\d+/.test(parsed.position) || // Starts with code pattern
            /\d{3,}/.test(parsed.position) || // Contains long number sequences
            /^[^a-zA-Z]*$/.test(parsed.position)) { // Only special chars/numbers
            parsed.position = null;
        }
    }
    // Additional ATS domain mapping if company is still null
    if (!parsed.company && context.from) {
        parsed.company = extractCompanyFromATSDomain(context.from, context.plaintext);
    }
    // Status validation - ensure only valid values
    const validStatuses = ['Applied', 'Interview', 'Declined', 'Offer'];
    if (parsed.status && !validStatuses.includes(parsed.status)) {
        // Try to map common variants
        const statusLower = parsed.status.toLowerCase();
        if (statusLower.includes('reject') || statusLower.includes('decline')) {
            parsed.status = 'Declined';
        }
        else if (statusLower.includes('interview') || statusLower.includes('screen')) {
            parsed.status = 'Interview';
        }
        else if (statusLower.includes('offer')) {
            parsed.status = 'Offer';
        }
        else if (statusLower.includes('appli') || statusLower.includes('submit')) {
            parsed.status = 'Applied';
        }
        else {
            parsed.status = null;
        }
    }
    return parsed;
}
// Enhanced ATS domain mapping
function extractCompanyFromATSDomain(from, plaintext) {
    const domain = from.toLowerCase();
    // Common ATS patterns
    const atsPatterns = [
        /@myworkday\.com/,
        /@greenhouse\.io/,
        /@lever\.co/,
        /@bamboohr\.com/,
        /@smartrecruiters\.com/,
        /@icims\.com/,
        /@successfactors\.com/,
        /@taleo\.net/
    ];
    const isATS = atsPatterns.some(pattern => pattern.test(domain));
    if (!isATS) {
        // Try to extract from regular company domain
        const match = from.match(/@([^.]+)\./);
        if (match) {
            const domainName = match[1];
            // Skip generic domains
            const genericDomains = ['gmail', 'yahoo', 'outlook', 'hotmail', 'mail'];
            if (!genericDomains.includes(domainName)) {
                return domainName.charAt(0).toUpperCase() + domainName.slice(1);
            }
        }
        return null;
    }
    // For ATS emails, try to extract company from email body
    const companyPatterns = [
        /at ([A-Z][A-Za-z\s&,.-]+?)\s*(?:\.|,|\n|for|has|is)/g,
        /with ([A-Z][A-Za-z\s&,.-]+?)\s*(?:\.|,|\n|for|has|is)/g,
        /([A-Z][A-Za-z\s&,.-]+?)\s+(?:has|is|team|hiring|position)/g,
        /position at ([A-Z][A-Za-z\s&,.-]+?)\s*(?:\.|,|\n)/g,
        /application for .+ at ([A-Z][A-Za-z\s&,.-]+?)\s*(?:\.|,|\n)/gi
    ];
    for (const pattern of companyPatterns) {
        const matches = plaintext.matchAll(pattern);
        for (const match of matches) {
            const candidate = match[1]?.trim();
            if (candidate && candidate.length > 2 && candidate.length < 50) {
                // Clean up common suffixes
                const cleaned = candidate
                    .replace(/\s+(Inc|LLC|Corp|Ltd|Company|Co)\.?$/i, '')
                    .trim();
                if (cleaned)
                    return cleaned;
            }
        }
    }
    return null;
}
// Stage 1: Fast job classification (optimized for speed <1.8s)
async function classifyEmail(input) {
    const startTime = Date.now();
    const subject = input.subject ?? "";
    const plaintext = input.plaintext ?? "";
    const from = input.from ?? "";
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? 0.0; // Lower temperature for classification consistency
    const maxTokens = input.maxTokens ?? 48; // Optimized for JSON schema compliance
    // Ultra-fast caching for classification
    const cacheContent = `${from}\n${subject}\n${plaintext.slice(0, 500)}`; // Smaller cache key
    const key = crypto_1.default.createHash("sha256").update(cacheContent).digest("hex");
    const cached = classificationCache.get(key);
    if (cached) {
        const duration = Date.now() - startTime;
        performanceMonitor.recordStage1(duration, true);
        return cached;
    }
    let session;
    try {
        session = await ensureStage1Session(modelPath);
    }
    catch (e) {
        console.error('Stage 1 session creation failed, marking as unhealthy:', e);
        stage1SessionHealthy = false;
        const duration = Date.now() - startTime;
        performanceMonitor.recordStage1(duration, false, e);
        performanceMonitor.recordSessionEvent('creation_error', 1);
        throw new Error(`Stage 1 session initialization failed: ${e.message}`);
    }
    // EMERGENCY: Ultra-minimal content for 512 token context
    const maxContentLength = 2000; // EMERGENCY: Reduced for 512 token Stage 1 context
    let emailContent = plaintext;
    if (plaintext.length > maxContentLength) {
        emailContent = plaintext.substring(0, maxContentLength);
    }
    // Minimal prompt for speed
    const userPrompt = [
        from ? `From: ${from}` : null,
        `Subject: ${subject}`,
        emailContent ? `Body: ${emailContent}` : null,
    ]
        .filter(Boolean)
        .join("\n");
    let response;
    try {
        response = await session.prompt(userPrompt, {
            temperature,
            maxTokens,
            responseFormat: {
                type: "json_schema",
                schema: classificationSchema,
                schema_id: "FastClassificationSchema",
            },
        });
    }
    catch (e) {
        // Mark session as unhealthy if inference fails
        if (e.message.includes('disposed') || e.message.includes('invalid')) {
            console.error('Stage 1 session became unhealthy during inference:', e.message);
            stage1SessionHealthy = false;
            performanceMonitor.recordSessionEvent('disposal_error', 1);
        }
        const duration = Date.now() - startTime;
        performanceMonitor.recordStage1(duration, false, e);
        throw e;
    }
    // Parse response with robust cleaning
    let parsed;
    try {
        const cleanedResponse = cleanLLMResponse(response);
        parsed = JSON.parse(cleanedResponse);
    }
    catch (err) {
        console.error('Stage 1 classification parsing failed:', err, 'Raw Response:', response);
        // Try regex fallback extraction
        const fallbackResult = extractJSONFromText(response);
        if (fallbackResult && typeof fallbackResult.is_job_related === 'boolean') {
            parsed = fallbackResult;
            console.log('✅ Stage 1 fallback extraction succeeded');
        }
        else {
            console.error('❌ Stage 1 fallback extraction failed, using default');
            parsed = { is_job_related: false };
        }
    }
    const duration = Date.now() - startTime;
    const success = parsed.is_job_related !== undefined;
    performanceMonitor.recordStage1(duration, success, success ? null : new Error('JSON parsing failed'));
    classificationCache.set(key, parsed);
    return parsed;
}
exports.classifyEmail = classifyEmail;
// Stage 2: Detailed parsing for job-related emails (optimized for accuracy)
async function parseJobEmail(input) {
    const startTime = Date.now();
    const subject = input.subject ?? "";
    const plaintext = input.plaintext ?? "";
    const from = input.from ?? "";
    const headers = input.headers ?? {};
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? config_1.LLM_TEMPERATURE;
    const maxTokens = input.maxTokens ?? config_1.LLM_MAX_TOKENS;
    // Detailed caching for parsing
    const cacheContent = `${from}\n${JSON.stringify(headers)}\n${subject}\n${plaintext.slice(0, 2000)}`;
    const key = crypto_1.default.createHash("sha256").update(cacheContent).digest("hex");
    const cached = parseCache.get(key);
    if (cached) {
        const duration = Date.now() - startTime;
        performanceMonitor.recordStage2(duration, true);
        const { is_job_related, ...result } = cached;
        return result;
    }
    let session;
    try {
        session = await ensureStage2Session(modelPath);
    }
    catch (e) {
        console.error('Stage 2 session creation failed, marking as unhealthy:', e);
        stage2SessionHealthy = false;
        const duration = Date.now() - startTime;
        performanceMonitor.recordStage2(duration, false, e);
        performanceMonitor.recordSessionEvent('creation_error', 2);
        throw new Error(`Stage 2 session initialization failed: ${e.message}`);
    }
    // EMERGENCY: Reduced content for 1024 token Stage 2 context
    const maxContentLength = 3000; // EMERGENCY: Reduced for 1024 token Stage 2 context
    let emailContent = plaintext;
    if (plaintext.length > maxContentLength) {
        // Keep first part (key info) and last part (signatures) for accuracy
        const firstPart = plaintext.substring(0, maxContentLength * 0.8);
        const lastPart = plaintext.slice(-maxContentLength * 0.2);
        emailContent = firstPart + "\n... [content truncated] ...\n" + lastPart;
    }
    // Comprehensive input for accuracy
    const userPrompt = [
        from ? `From: ${from}` : null,
        headers.To ? `To: ${headers.To}` : null,
        headers.Date ? `Date: ${headers.Date}` : null,
        `Subject: ${subject}`,
        `Body: ${emailContent}`,
    ]
        .filter(Boolean)
        .join("\n");
    let response;
    try {
        response = await session.prompt(userPrompt, {
            temperature,
            maxTokens,
            responseFormat: {
                type: "json_schema",
                schema: {
                    type: "object",
                    properties: {
                        company: { type: ["string", "null"] },
                        position: { type: ["string", "null"] },
                        status: { type: ["string", "null"], enum: ["Applied", "Interview", "Declined", "Offer", null] },
                    },
                    required: ["company", "position", "status"],
                    additionalProperties: false,
                },
                schema_id: "DetailedParsingSchema",
            },
        });
    }
    catch (e) {
        // Mark session as unhealthy if inference fails
        if (e.message.includes('disposed') || e.message.includes('invalid')) {
            console.error('Stage 2 session became unhealthy during inference:', e.message);
            stage2SessionHealthy = false;
            performanceMonitor.recordSessionEvent('disposal_error', 2);
        }
        const duration = Date.now() - startTime;
        performanceMonitor.recordStage2(duration, false, e);
        throw e;
    }
    // Parse and validate response with robust cleaning
    let parsed;
    try {
        const cleanedResponse = cleanLLMResponse(response);
        parsed = JSON.parse(cleanedResponse);
    }
    catch (err) {
        console.error('Stage 2 parsing failed:', err, 'Raw Response:', response);
        // Try regex fallback extraction
        const fallbackResult = extractJSONFromText(response);
        if (fallbackResult && (fallbackResult.company !== undefined || fallbackResult.position !== undefined)) {
            parsed = {
                company: fallbackResult.company || null,
                position: fallbackResult.position || null,
                status: fallbackResult.status || null
            };
            console.log('✅ Stage 2 fallback extraction succeeded');
        }
        else {
            console.error('❌ Stage 2 fallback extraction failed, using default');
            parsed = { company: null, position: null, status: null };
        }
    }
    // Apply post-processing normalization and validation for accuracy
    const fullResult = { is_job_related: true, ...parsed };
    const normalized = normalizeAndValidateResult(fullResult, { subject, from, plaintext: emailContent });
    const finalResult = { company: normalized.company, position: normalized.position, status: normalized.status };
    const duration = Date.now() - startTime;
    const success = parsed.company !== undefined || parsed.position !== undefined;
    performanceMonitor.recordStage2(duration, success, success ? null : new Error('JSON parsing failed'));
    parseCache.set(key, { is_job_related: true, ...finalResult });
    return finalResult;
}
exports.parseJobEmail = parseJobEmail;
// Two-stage processing: Fast classification + detailed parsing
async function parseEmailWithTwoStage(input) {
    // Stage 1: Fast classification
    const classification = await classifyEmail({
        subject: input.subject,
        plaintext: input.plaintext,
        from: input.from,
        modelPath: input.modelPath,
        temperature: 0.0,
        maxTokens: 48, // Optimized for JSON schema compliance
    });
    // If not job-related, return early (major performance win)
    if (!classification.is_job_related) {
        return {
            is_job_related: false,
            company: null,
            position: null,
            status: null,
        };
    }
    // Stage 2: Detailed parsing for job-related emails
    const details = await parseJobEmail(input);
    return {
        is_job_related: true,
        ...details,
    };
}
exports.parseEmailWithTwoStage = parseEmailWithTwoStage;
// Backward compatibility: Original unified function
async function parseEmailWithLLM(input) {
    // Use the new two-stage processing by default for better performance
    const USE_TWO_STAGE = process.env.ONLYJOBS_USE_TWO_STAGE !== 'false'; // Enable by default
    if (USE_TWO_STAGE) {
        return parseEmailWithTwoStage(input);
    }
    // Fallback to unified processing for backward compatibility
    const subject = input.subject ?? "";
    const plaintext = input.plaintext ?? "";
    const from = input.from ?? "";
    const headers = input.headers ?? {};
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? config_1.LLM_TEMPERATURE;
    const maxTokens = input.maxTokens ?? config_1.LLM_MAX_TOKENS;
    // Include headers in cache key for more accurate caching
    const cacheContent = `${from}\n${subject}\n${plaintext.slice(0, 1000)}`;
    const key = crypto_1.default.createHash("sha256").update(cacheContent).digest("hex");
    const cached = unifiedCache.get(key);
    if (cached)
        return cached;
    const session = await ensureUnifiedSession(modelPath);
    // EMERGENCY: Reduced content for 512 token unified context
    const maxContentLength = 2000; // EMERGENCY: Reduced for 512 token unified context
    let emailContent = plaintext;
    if (plaintext.length > maxContentLength) {
        // Keep first part (usually contains key info) and last part (signatures)
        const firstPart = plaintext.substring(0, maxContentLength * 0.8);
        const lastPart = plaintext.slice(-maxContentLength * 0.2);
        emailContent = firstPart + "\n... [content truncated] ...\n" + lastPart;
    }
    // Build comprehensive input with headers for better context
    const userPrompt = [
        from ? `From: ${from}` : null,
        headers.To ? `To: ${headers.To}` : null,
        headers.Date ? `Date: ${headers.Date}` : null,
        `Subject: ${subject}`,
        `Body: ${emailContent}`,
    ]
        .filter(Boolean)
        .join("\n");
    const response = await session.prompt(userPrompt, {
        temperature,
        maxTokens,
        responseFormat: {
            type: "json_schema",
            schema: fullParseSchema,
            schema_id: "UnifiedEmailParseSchema",
        },
    });
    // Parse and validate response with robust cleaning
    let parsed;
    try {
        const cleanedResponse = cleanLLMResponse(response);
        parsed = JSON.parse(cleanedResponse);
    }
    catch (err) {
        console.error('Unified LLM response parsing failed:', err, 'Raw Response:', response);
        // Try regex fallback extraction
        const fallbackResult = extractJSONFromText(response);
        if (fallbackResult && typeof fallbackResult.is_job_related === 'boolean') {
            parsed = {
                is_job_related: fallbackResult.is_job_related,
                company: fallbackResult.company || null,
                position: fallbackResult.position || null,
                status: fallbackResult.status || null
            };
            console.log('✅ Unified fallback extraction succeeded');
        }
        else {
            console.error('❌ Unified fallback extraction failed, using default');
            parsed = { is_job_related: false, company: null, position: null, status: null };
        }
    }
    // Apply post-processing normalization and validation
    parsed = normalizeAndValidateResult(parsed, { subject, from, plaintext: emailContent });
    unifiedCache.set(key, parsed);
    return parsed;
}
exports.parseEmailWithLLM = parseEmailWithLLM;
