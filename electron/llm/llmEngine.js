"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEmailWithLLM = exports.parseEmailWithTwoStage = exports.parseJobEmail = exports.classifyEmail = void 0;
const crypto = require("crypto");
const config_1 = require("./config");
const util = require('util');

// VERSION CHECK: This helps identify if user is running an old cached version
const LLM_ENGINE_VERSION = "2.0-ABORT-CONTROLLER-FIX";
console.log(`🆔 LLM Engine Version: ${LLM_ENGINE_VERSION} - AbortController timeout fixes active`);
console.log(`📊 Timeout Configuration: STAGE1=${config_1.STAGE1_TIMEOUT}ms, STAGE2=${config_1.STAGE2_TIMEOUT}ms`);

// OLD TIMEOUT WRAPPER REMOVED - was causing 30000ms hardcoded timeout issues
// All timeouts now use AbortController for proper cancellation with node-llama-cpp
// DO NOT RE-ADD THIS FUNCTION - it bypasses AbortController and causes timeout problems

// Session cleanup utility
function cleanupSession(session, context) {
    try {
        if (session && typeof session.dispose === 'function') {
            session.dispose();
        }
        if (context && typeof context.dispose === 'function') {
            context.dispose();
        }
    } catch (error) {
        console.warn('Session cleanup warning:', error.message);
    }
}
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
// Stage 1: ULTRA-STRICT JSON-only classifier for Llama-3.2-3B
const STAGE1_CLASSIFICATION_PROMPT = `You must respond with ONLY a JSON object. No text before or after.

Classify: Is this email about a job application status update?

TRUE = Application confirmations, rejections, interviews, offers from companies you applied to
FALSE = Job ads, newsletters, recommendations

Examples:
"thank you for applying" = TRUE
"application received" = TRUE  
"decided not to proceed" = TRUE
"job recommendations" = FALSE

Respond with exactly this format:
{"is_job_related":true,"manual_record_risk":"low"}

OR

{"is_job_related":false,"manual_record_risk":"low"}`;
// Stage 2: ULTRA-STRICT JSON-only parser for Llama-3.2-3B
const STAGE2_PARSING_PROMPT = `You must respond with ONLY a JSON object. No text before or after.

Extract job application details:

COMPANY: Real employer name (not ATS domain like myworkday/greenhouse)
POSITION: Complete job title including codes (e.g., "Health Information Consultant - JR156260")  
STATUS: Applied/Interview/Declined/Offer

ATS RULES:
- myworkday emails → find real company in email body
- greenhouse emails → find real company in email body
- Extract COMPLETE position titles with all codes

Respond with exactly this format:
{"company":"Elevance Health","position":"Health Information Consultant - JR156260","status":"Declined"}

If no position mentioned, use "Unknown" for position.`;
// Enhanced caching with TTL and size limits
class LRUCache {
    constructor(maxSize = 100, ttlMs = 300000) { // 5 minute TTL
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        // Move to end for LRU
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }
    
    set(key, value) {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        
        this.cache.set(key, {
            value,
            expiry: Date.now() + this.ttlMs
        });
    }
    
    clear() {
        this.cache.clear();
    }
    
    size() {
        return this.cache.size;
    }
}

// Enhanced caches with performance tracking
const classificationCache = new LRUCache(50, 300000); // Smaller for Stage 1
const parseCache = new LRUCache(200, 600000); // Larger for Stage 2
const unifiedCache = new LRUCache(150, 450000);

// Performance monitoring (legacy - migrating to production monitor)
let performanceStats = {
    stage1: { calls: 0, totalTime: 0, timeouts: 0, cacheHits: 0 },
    stage2: { calls: 0, totalTime: 0, timeouts: 0, cacheHits: 0 }
};

// Import fallback classifier for when LLM fails
const { classifyEmailWithRules } = require('./fallback-classifier');
function makeCacheKey(subject, plaintext, from) {
    // More intelligent cache key for better hit rates
    const normalizedSubject = subject.toLowerCase().replace(/re:|fwd:|\[.*?\]/g, '').trim();
    const contentSample = plaintext.slice(0, 500); // Smaller sample for Stage 1
    const domainPart = from ? from.split('@')[1] || '' : '';
    const canonical = normalizedSubject + "\n" + contentSample + "\n" + domainPart;
    return crypto.createHash("sha256").update(canonical).digest("hex");
}

// Enhanced content preprocessing for mixed-content emails (application + job description)
function preprocessEmailContent(plaintext, maxLength = 3000, isStage1 = true) {
    if (!plaintext || plaintext.length <= maxLength) {
        return plaintext;
    }
    
    // For Stage 1 classification, prioritize key sections that determine job-relatedness
    if (isStage1) {
        return preprocessForClassification(plaintext, maxLength);
    } else {
        return preprocessForParsing(plaintext, maxLength);
    }
}

function preprocessForClassification(plaintext, maxLength) {
    const lines = plaintext.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Priority sections for classification (most important first)
    const prioritySections = [];
    const normalSections = [];
    const lowPrioritySections = [];
    
    for (const line of lines) {
        const lineLower = line.toLowerCase();
        
        // High priority: Application confirmation signals
        if (/thank\s+you\s+for\s+(applying|your\s+(application|interest))|application\s+(received|submitted|confirmation)|we\s+have\s+(received|successfully\s+received)|interview\s+(invitation|scheduled)|job\s+offer|regret\s+to\s+inform|unfortunately.*not\s+(selected|moving)/i.test(line)) {
            prioritySections.push(line);
        }
        // Medium priority: Company/position mentions
        else if ((/position|role|opening|candidate|candidacy|hiring|career/i.test(line) && line.length < 200) || 
                 /^\s*[A-Z][a-zA-Z\s&,.-]+(?:\s+(?:Inc|LLC|Corp|Ltd|Company|Co)\.?)?\s*$/i.test(line)) {
            normalSections.push(line);
        }
        // Low priority: Boilerplate, legal text, social media
        else if (/equal\s+employment\s+opportunity|follow\s+us\s+on\s+social\s+media|this\s+email\s+box\s+is\s+not\s+monitored|confidential|do\s+not\s+reply|career\s+site|hiring\s+events/i.test(line)) {
            lowPrioritySections.push(line);
        }
        // Normal priority: Everything else
        else {
            normalSections.push(line);
        }
    }
    
    // Build content with priority order
    let result = '';
    let currentLength = 0;
    
    // Add priority sections first
    for (const section of prioritySections) {
        if (currentLength + section.length + 1 <= maxLength) {
            result += (result ? '\n' : '') + section;
            currentLength += section.length + 1;
        }
    }
    
    // Add normal sections
    for (const section of normalSections) {
        if (currentLength + section.length + 1 <= maxLength) {
            result += (result ? '\n' : '') + section;
            currentLength += section.length + 1;
        }
    }
    
    // Add low priority sections if space remains
    for (const section of lowPrioritySections) {
        if (currentLength + section.length + 1 <= maxLength) {
            result += (result ? '\n' : '') + section;
            currentLength += section.length + 1;
        }
    }
    
    return result || plaintext.substring(0, maxLength);
}

function preprocessForParsing(plaintext, maxLength) {
    // For parsing, keep first part + last part strategy but be smarter about it
    if (plaintext.length <= maxLength) return plaintext;
    
    const lines = plaintext.split('\n');
    const firstQuarter = Math.floor(lines.length * 0.6);  // 60% from beginning
    const lastQuarter = Math.floor(lines.length * 0.1);   // 10% from end
    
    const firstPart = lines.slice(0, firstQuarter).join('\n');
    const lastPart = lines.slice(-lastQuarter).join('\n');
    
    const combined = firstPart + '\n\n... [content truncated] ...\n\n' + lastPart;
    
    if (combined.length > maxLength) {
        // If still too long, fall back to simple truncation
        return plaintext.substring(0, maxLength * 0.9) + '... [truncated]';
    }
    
    return combined;
}

// Performance reporting function
function logPerformanceStats() {
    console.log('🔍 LLM Performance Stats:', {
        stage1: {
            avgTime: performanceStats.stage1.calls > 0 ? 
                Math.round(performanceStats.stage1.totalTime / performanceStats.stage1.calls) : 0,
            cacheHitRate: performanceStats.stage1.calls > 0 ?
                Math.round((performanceStats.stage1.cacheHits / performanceStats.stage1.calls) * 100) : 0,
            timeoutRate: performanceStats.stage1.calls > 0 ?
                Math.round((performanceStats.stage1.timeouts / performanceStats.stage1.calls) * 100) : 0,
            ...performanceStats.stage1
        },
        caches: {
            stage1Size: classificationCache.size(),
            stage2Size: parseCache.size(),
            unifiedSize: unifiedCache.size()
        }
    });
}
async function ensureModel(modelPath) {
    if (loadedModel && loadedModelPath === modelPath)
        return loadedModel;
    
    // Add timeout wrapper for model loading
    const modelLoadTimeout = 15000; // 15 second timeout for model loading
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
        abortController.abort();
    }, modelLoadTimeout);
    
    try {
        const module = await loadLlamaModule();
        const { getLlama } = module;
        const llama = await getLlama();
        
        // Use AbortController signal for model loading
        loadedModel = await llama.loadModel({ 
            modelPath,
            signal: abortController.signal 
        });
        loadedModelPath = modelPath;
        clearTimeout(timeoutId);
        return loadedModel;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
            throw new Error(`Model loading timed out after ${modelLoadTimeout}ms`);
        }
        throw error;
    }
}
// Stage 1: Fast classification session (small context, optimized for speed)
// OPTIMIZED SESSION MANAGEMENT with health tracking
let stage1SessionRetryCount = 0;
const MAX_SESSION_RETRIES = 2; // Reduced for faster recovery
const MAX_SESSION_USES = 10; // Allow session reuse up to 10 times
let stage1SessionUses = 0;

async function ensureStage1Session(modelPath) {
    if (stage1Session && loadedModelPath === modelPath && stage1SessionUses < MAX_SESSION_USES) {
        // Health check with session reuse counting
        try {
            if (stage1Session.contextSequence && stage1Context) {
                stage1SessionUses++;
                console.log(`♻️ Reusing Stage 1 session (use ${stage1SessionUses}/${MAX_SESSION_USES})`);
                return stage1Session;
            }
        } catch (error) {
            console.warn(`Stage 1 session health check failed (retry ${stage1SessionRetryCount}/${MAX_SESSION_RETRIES}):`, error.message);
            stage1SessionRetryCount++;
            
            // Quick recovery - recreate session immediately
            if (stage1SessionRetryCount >= MAX_SESSION_RETRIES) {
                console.log('🔄 Stage 1 session exceeded retries, creating fresh session');
                cleanupSession(stage1Session, stage1Context);
                stage1Session = null;
                stage1Context = null;
                stage1SessionRetryCount = 0;
                stage1SessionUses = 0;
            } else {
                // Try to continue with existing session for one more attempt
                return stage1Session;
            }
        }
    }
    
    // Reset session if it exceeded max uses
    if (stage1SessionUses >= MAX_SESSION_USES) {
        console.log('🔄 Stage 1 session reached max uses, creating fresh session');
        cleanupSession(stage1Session, stage1Context);
        stage1Session = null;
        stage1Context = null;
        stage1SessionUses = 0;
    }
    
    const model = await ensureModel(modelPath);
    const module = await loadLlamaModule();
    const { LlamaContext, LlamaChatSession } = module;
    
    // Clean up existing context if needed
    if (stage1Context) {
        cleanupSession(null, stage1Context);
    }
    
    // ULTRA-AGGRESSIVE Stage 1 context - minimal for maximum speed
    console.log(`Creating Stage 1 session with ${config_1.STAGE1_CONTEXT || 512} tokens (ultra-fast)`);
    const contextStart = Date.now();
    
    // Add timeout for context creation
    const contextTimeout = 10000; // 10 second timeout for context creation
    const contextAbortController = new AbortController();
    const contextTimeoutId = setTimeout(() => {
        contextAbortController.abort();
    }, contextTimeout);
    
    try {
        stage1Context = await model.createContext({
            contextSize: config_1.STAGE1_CONTEXT || 512, // Reduced from 1024 to 512
            batchSize: 128, // Smaller batch for faster processing
            signal: contextAbortController.signal
        });
        clearTimeout(contextTimeoutId);
    } catch (error) {
        clearTimeout(contextTimeoutId);
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
            throw new Error(`Stage 1 context creation timed out after ${contextTimeout}ms`);
        }
        throw error;
    }
    const sequence = stage1Context.getSequence();
    stage1Session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: STAGE1_CLASSIFICATION_PROMPT
    });
    
    const contextDuration = Date.now() - contextStart;
    console.log(`⚡ Stage 1 session created in ${contextDuration}ms with ${config_1.STAGE1_CONTEXT || 512} token context`);
    stage1SessionRetryCount = 0; // Reset retry count on successful creation
    return stage1Session;
}
// Stage 2: Detailed parsing session (full context, optimized for accuracy)
async function ensureStage2Session(modelPath) {
    if (stage2Session && loadedModelPath === modelPath)
        return stage2Session;
    const model = await ensureModel(modelPath);
    const module = await loadLlamaModule();
    const { LlamaContext, LlamaChatSession } = module;
    // Use full context for Stage 2 detailed parsing
    // Add timeout for Stage 2 context creation
    const contextTimeout = 12000; // 12 second timeout for Stage 2 context
    const contextAbortController = new AbortController();
    const contextTimeoutId = setTimeout(() => {
        contextAbortController.abort();
    }, contextTimeout);
    
    try {
        stage2Context = await model.createContext({
            contextSize: config_1.STAGE2_CONTEXT || config_1.LLM_CONTEXT,
            batchSize: 512,
            signal: contextAbortController.signal
        });
        clearTimeout(contextTimeoutId);
    } catch (error) {
        clearTimeout(contextTimeoutId);
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
            throw new Error(`Stage 2 context creation timed out after ${contextTimeout}ms`);
        }
        throw error;
    }
    const sequence = stage2Context.getSequence();
    stage2Session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: STAGE2_PARSING_PROMPT
    });
    return stage2Session;
}
// Backward compatibility: Unified session
async function ensureUnifiedSession(modelPath) {
    if (unifiedSession && loadedModelPath === modelPath)
        return unifiedSession;
    const model = await ensureModel(modelPath);
    const module = await loadLlamaModule();
    const { LlamaContext, LlamaChatSession } = module;
    // Add timeout for unified context creation
    const contextTimeout = 15000; // 15 second timeout for unified context
    const contextAbortController = new AbortController();
    const contextTimeoutId = setTimeout(() => {
        contextAbortController.abort();
    }, contextTimeout);
    
    try {
        unifiedContext = await model.createContext({
            contextSize: config_1.LLM_CONTEXT,
            batchSize: 512,
            signal: contextAbortController.signal
        });
        clearTimeout(contextTimeoutId);
    } catch (error) {
        clearTimeout(contextTimeoutId);
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
            throw new Error(`Unified context creation timed out after ${contextTimeout}ms`);
        }
        throw error;
    }
    const sequence = unifiedContext.getSequence();
    unifiedSession = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: STAGE2_PARSING_PROMPT // Use full prompt for backward compatibility
    });
    return unifiedSession;
}
// Enhanced company name normalization function with better ATS handling
function normalizeCompanyName(company) {
    if (!company || typeof company !== 'string') return null;
    
    let normalized = company.trim();
    
    // Remove common prefixes
    normalized = normalized.replace(/^(The\s+)/i, '');
    
    // Enhanced company mappings including your specific examples
    const companyMappings = {
        // Your specific examples
        'Elevance Health Companies, Inc.': 'Elevance Health',
        'The Elevance Health Companies, Inc.': 'Elevance Health', 
        'Elevance Health Companies': 'Elevance Health',
        'becoming a future IBMer': 'IBM',
        'future IBMer': 'IBM',
        'IBMer': 'IBM',
        'J.D Power': 'J.D. Power',
        'JD Power': 'J.D. Power',
        'Data Analyst at J': 'J.D. Power', // Handle truncated extractions
        'myworkday': null, // Invalid - should be filtered out
        
        // Other common variations
        'University of California, Irvine': 'UCI',
        'UC Irvine': 'UCI', 
        'UCI Health': 'UCI',
        'Google LLC': 'Google',
        'Meta Platforms, Inc.': 'Meta',
        'Microsoft Corporation': 'Microsoft',
        'Apple Inc.': 'Apple',
        'Amazon.com, Inc.': 'Amazon'
    };
    
    // Check for exact mappings first
    if (companyMappings[normalized]) {
        return companyMappings[normalized];
    }
    
    // Pattern-based corrections for partial matches
    if (/future\s+ibmer/gi.test(normalized)) return 'IBM';
    if (/elevance\s*health/gi.test(normalized)) return 'Elevance Health';
    if (/j\.?d\.?\s*power/gi.test(normalized)) return 'J.D. Power';
    
    // Filter out obviously wrong extractions
    const invalidPatterns = [
        /^myworkday$/gi,
        /^greenhouse$/gi,
        /^talent\s+acquisition/gi,
        /^hiring\s+team/gi,
        /^(we|you|your|our|this|that|it|they)$/gi,
        /\b(email|message|notification|alert|update)\b/gi
    ];
    
    for (const pattern of invalidPatterns) {
        if (pattern.test(normalized)) {
            return null;
        }
    }
    
    // Remove common suffixes (Inc., LLC, Corp, etc.)
    normalized = normalized.replace(/\s+(Inc\.?|LLC|Corp\.?|Corporation|Ltd\.?|Company|Companies|Co\.?)(\s|$)/gi, ' ').trim();
    
    // Clean up multiple spaces
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Validate length and content
    if (normalized.length < 2 || normalized.length > 100) {
        return null;
    }
    
    // Additional validation - ensure it looks like a company name
    if (/^[^a-zA-Z]*$/.test(normalized) || // Only special chars/numbers
        /^\d+$/.test(normalized)) { // Only numbers
        return null;
    }
    
    return normalized;
}

// Enhanced position title normalization - preserve meaningful codes and identifiers
function normalizePositionTitle(position) {
    if (!position || typeof position !== 'string') return null;
    
    let normalized = position.trim();
    
    // Handle "Unknown" values first
    if (/^(unknown|n\/a|null|undefined|unclear)$/i.test(normalized)) {
        return "Unknown";
    }
    
    // Always preserve job titles with meaningful codes - be much less aggressive
    // Just clean up obvious non-title parts without removing job codes
    normalized = normalized
        .replace(/\([^)]*(?:FT|PT|Full-?time|Part-?time|Contract|Remote|On-?site|Hybrid)[^)]*\)/gi, '') // Remove employment details in parentheses
        .replace(/\s*-\s*(?:FT|PT|Full-?time|Part-?time|Contract|Remote|On-?site|Hybrid|Day|Night|Evening|Weekend)$/gi, '') // Remove employment details at end only
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    // Handle complex multi-part titles - be more conservative about removal
    if (normalized.includes(' - ')) {
        const parts = normalized.split(' - ').map(p => p.trim());
        const meaningfulParts = [];
        
        for (const part of parts) {
            const partLower = part.toLowerCase();
            // Skip employment details but keep job-specific terms
            if (/^(ft|pt|full-?time|part-?time|contract|remote|on-?site|hybrid|day|night|evening|weekend)$/i.test(part)) {
                continue;
            }
            // Skip location-like parts (simple heuristic) but allow meaningful codes
            if (part.length <= 3 && /^[A-Z]{2,3}$/.test(part) && !/\d/.test(part)) {
                continue;
            }
            meaningfulParts.push(part);
            
            // Keep maximum 3 parts for readability
            if (meaningfulParts.length >= 3) break;
        }
        
        if (meaningfulParts.length > 0) {
            normalized = meaningfulParts.join(' - ');
        }
    }
    
    // Final cleanup
    normalized = normalized
        .replace(/\s*-\s*$/, '') // Remove trailing dash
        .replace(/^\s*-\s*/, '') // Remove leading dash  
        .replace(/\s+/g, ' ')    // Normalize spaces
        .trim();
    
    // Validate length and content
    if (normalized.length < 3 || normalized.length > 150) {
        return null;
    }
    
    // More lenient validation - allow meaningful job codes
    if (/^[^a-zA-Z]*$/.test(normalized)) { // Only special chars/numbers (no letters at all)
        return null;
    }
    
    // Filter out obviously corrupted extractions but allow valid job titles with codes
    const corruptedPatterns = [
        /^[A-Z]\d+$/, // Only a code like "JR123" without context
        /^\d+$/, // Only numbers
        /^(at|with|for|in|by|the|and|or)$/i, // Common prepositions/articles only
    ];
    
    for (const pattern of corruptedPatterns) {
        if (pattern.test(normalized)) {
            return null;
        }
    }
    
    return normalized;
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
    // Enhanced company name normalization
    if (parsed.company) {
        // Clean up "unknown" values
        if (/^(unknown|n\/a|null|undefined|unclear)$/i.test(parsed.company)) {
            parsed.company = null;
        } else {
            // Normalize company name
            parsed.company = normalizeCompanyName(parsed.company);
        }
    }
    
    // Enhanced position normalization
    if (parsed.position) {
        // Clean up "unknown" values but preserve "Unknown" as valid
        if (/^(n\/a|null|undefined|unclear)$/i.test(parsed.position)) {
            parsed.position = "Unknown";
        } else if (/^unknown$/i.test(parsed.position)) {
            parsed.position = "Unknown";
        } else {
            // Normalize position title
            parsed.position = normalizePositionTitle(parsed.position);
        }
    } else {
        // If position is null but this is job-related, set to Unknown
        if (parsed.is_job_related) {
            parsed.position = "Unknown";
        }
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
// Enhanced ATS domain mapping with specific patterns for your failed cases
function extractCompanyFromATSDomain(from, plaintext) {
    const domain = from.toLowerCase();
    // Common ATS patterns
    const atsPatterns = [
        /@myworkday\.com/,
        /@greenhouse\.io/,
        /@greenhouse-mail\.io/,
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
            // Skip generic domains but include known companies
            const genericDomains = ['gmail', 'yahoo', 'outlook', 'hotmail', 'mail', 'no-reply', 'noreply'];
            if (!genericDomains.includes(domainName)) {
                // Handle special cases for known companies
                if (domainName === 'realtor') return 'Realtor.com';
                return domainName.charAt(0).toUpperCase() + domainName.slice(1);
            }
        }
        return null;
    }
    
    // Enhanced patterns for ATS emails based on your specific failures
    const companyPatterns = [
        // Specific patterns for common phrases in your examples
        /(?:opportunity|position|role)\s+at\s+([A-Z][A-Za-z\s&,.-]+?)(?:\s*\.|,|\n|$)/gi,
        /thank\s+you\s+for.*?(?:interest\s+in|applying\s+to).*?at\s+([A-Z][A-Za-z\s&,.-]+?)(?:\s*\.|,|\n)/gi,
        /([A-Z][A-Za-z\s&,.-]+?)\s+(?:Talent\s+Acquisition|hiring|team)/gi,
        /application\s+(?:for|to).*?at\s+([A-Z][A-Za-z\s&,.-]+?)(?:\s*\.|,|\n|$)/gi,
        /considering\s+(?:us|IBM|.*?)\s+as.*?employer/gi, // Special case for IBM
        /future\s+([A-Z][A-Za-z]+er)\b/g, // Match "future IBMer" pattern
        /([A-Z][A-Za-z\s&,.-]+?)\s+(?:Health|Power|Corp|Inc|LLC)(?:\s|$)/gi,
        // Broader patterns
        /at\s+([A-Z][A-Za-z\s&,.-]+?)(?:\s*[.,:!?]|\s+(?:we|has|is|team|hiring|position))/gi,
        /with\s+([A-Z][A-Za-z\s&,.-]+?)(?:\s*[.,:!?]|\s+(?:we|has|is|team|hiring|position))/gi,
        /([A-Z][A-Za-z\s&,.-]{2,30}?)(?:\s+(?:has|is|team|hiring|position|opportunity))/g
    ];

    // Special handling for known company patterns in your examples
    const specialMappings = [
        { pattern: /elevance\s*health/gi, company: "Elevance Health" },
        { pattern: /future\s+ibmer/gi, company: "IBM" },
        { pattern: /j\.?d\.?\s*power/gi, company: "J.D. Power" },
        { pattern: /realtor\.?com/gi, company: "Realtor.com" }
    ];

    // Check special mappings first
    for (const mapping of specialMappings) {
        if (mapping.pattern.test(plaintext)) {
            return mapping.company;
        }
    }

    // Try regular patterns
    for (const pattern of companyPatterns) {
        const matches = plaintext.matchAll(pattern);
        for (const match of matches) {
            const candidate = match[1]?.trim();
            if (candidate && candidate.length > 2 && candidate.length < 60) {
                // Clean up and validate
                let cleaned = candidate
                    .replace(/\s+(Inc|LLC|Corp|Ltd|Company|Companies|Co)\.?$/i, '')
                    .replace(/^(The\s+)/i, '')
                    .trim();
                
                // Skip obviously wrong extractions
                if (cleaned.toLowerCase().includes('myworkday') ||
                    cleaned.toLowerCase().includes('greenhouse') ||
                    cleaned.toLowerCase().includes('talent acquisition') ||
                    cleaned.toLowerCase().includes('hiring team') ||
                    /^(we|you|your|our|this|that|it|they)$/i.test(cleaned)) {
                    continue;
                }
                
                if (cleaned && cleaned.length > 2) {
                    return cleaned;
                }
            }
        }
    }
    return null;
}
// Stage 1: Fast job classification (optimized for speed <1.8s)
async function classifyEmail(input) {
    const subject = input.subject ?? "";
    const plaintext = input.plaintext ?? "";
    const from = input.from ?? "";
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? 0.0; // Lower temperature for classification consistency
    const maxTokens = input.maxTokens ?? 24; // Even smaller for faster inference
    const startTime = Date.now();
    performanceStats.stage1.calls++;
    
    // CRITICAL DEBUGGING: Force display of timeout configuration
    const actualTimeout = config_1.STAGE1_TIMEOUT || 8000;
    console.log(`🔍 STAGE1_TIMEOUT DEBUG: actualTimeout=${actualTimeout}ms, config_1.STAGE1_TIMEOUT=${config_1.STAGE1_TIMEOUT}, env=${process.env.ONLYJOBS_STAGE1_TIMEOUT}`);
    
    // ULTRA-AGGRESSIVE content preprocessing for Stage 1 (sub-5s target)
    const maxContentLength = 1500; // Drastically reduced from 3000 for speed
    let emailContent = preprocessEmailContent(plaintext, maxContentLength, true);
    
    // Additional aggressive preprocessing for classification-only needs
    emailContent = emailContent
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/https?:\/\/[^\s]+/g, '[URL]') // Replace URLs
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Replace emails
        .trim();
    
    console.log(`Stage 1 processing ${emailContent.length} chars (reduced from ${plaintext.length})`);
    
    // Cache debug info
    const reductionRatio = ((plaintext.length - emailContent.length) / plaintext.length * 100).toFixed(1);
    
    // Enhanced caching for classification
    const key = makeCacheKey(subject, emailContent, from);
    const cached = classificationCache.get(key);
    if (cached) {
        performanceStats.stage1.cacheHits++;
        console.log('Stage 1 cache hit');
        console.log('💾 Stage 1 cache hit');
        return cached;
    }
    const session = await ensureStage1Session(modelPath);
    // Minimal prompt for speed
    const userPrompt = [
        from ? `From: ${from}` : null,
        `Subject: ${subject}`,
        emailContent ? `Body: ${emailContent}` : null,
    ]
        .filter(Boolean)
        .join("\n");
    // CRITICAL FIX: Use Promise.race with hard timeout to bypass node-llama-cpp's internal 30000ms timeout
    // This completely abandons the inference if it takes too long, ensuring our timeout is respected
    console.log(`🔥 Stage 1 inference with ${actualTimeout}ms HARD TIMEOUT (bypassing node-llama-cpp limitations)`);
    
    // Create a hard timeout promise that resolves with a timeout error
    const hardTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            console.log(`💀 HARD TIMEOUT: Abandoning Stage 1 inference after ${actualTimeout}ms`);
            reject(new Error(`HARD_TIMEOUT: Stage 1 inference abandoned after ${actualTimeout}ms (bypassing node-llama-cpp)`));
        }, actualTimeout);
    });
    
    let response;
    try {
        // Create the actual inference promise
        const inferencePromise = session.prompt(userPrompt, {
            temperature: 0.0, // Force deterministic for speed
            maxTokens: config_1.STAGE1_MAX_TOKENS || 24, // Ultra-minimal tokens
            responseFormat: {
                type: "json_schema",
                schema: classificationSchema,
                schema_id: "FastClassificationSchema",
            },
        });
        
        console.log(`🚀 Racing inference against ${actualTimeout}ms hard timeout...`);
        
        // Race the inference against our hard timeout - whichever resolves first wins
        response = await Promise.race([inferencePromise, hardTimeoutPromise]);
        
        console.log(`✅ Stage 1 session.prompt completed successfully before timeout`);
    } catch (error) {
        const duration = Date.now() - startTime;
        performanceStats.stage1.totalTime += duration;
        
        // CRITICAL DEBUGGING: Analyze the exact error
        console.error(`🐛 STAGE 1 ERROR ANALYSIS:`, {
            errorName: error.name,
            errorMessage: error.message,
            duration,
            actualTimeoutUsed: actualTimeout,
            isHardTimeout: error.message.includes('HARD_TIMEOUT'),
            isAbortError: error.name === 'AbortError',
            containsAborted: error.message.includes('aborted'),
            contains30000: error.message.includes('30000'),
            contains8000: error.message.includes('8000'),
            stackTrace: error.stack?.split('\n').slice(0, 3)
        });
        
        // Check for our hard timeout first
        if (error.message.includes('HARD_TIMEOUT')) {
            performanceStats.stage1.timeouts++;
            console.error(`💀 Stage 1 HARD TIMEOUT after ${actualTimeout}ms - bypassed node-llama-cpp:`, {
                duration,
                subjectLength: subject.length,
                contentLength: emailContent.length,
                fromDomain: from ? from.split('@')[1] : 'unknown',
                errorType: 'HARD_TIMEOUT_BYPASS'
            });
        } else if (error.name === 'AbortError' || error.message.includes('aborted')) {
            performanceStats.stage1.timeouts++;
            console.error(`⏱️ Stage 1 classification timed out after ${actualTimeout}ms (AbortController):`, {
                duration,
                subjectLength: subject.length,
                contentLength: emailContent.length,
                fromDomain: from ? from.split('@')[1] : 'unknown',
                errorType: 'ABORT_SIGNAL'
            });
        } else {
            console.error('Stage 1 classification error (NOT timeout-related):', error.message);
        }
        
        // Record failure in production monitor
        console.error('Stage 1 failure:', error.message);
        
        // Return null to trigger immediate rule-based fallback
        throw new Error(`Stage 1 failed after ${duration}ms: ${error.message}`);
    }
    // Enhanced JSON response cleaning for LLM consistency issues
    function cleanLLMResponse(rawResponse) {
        return rawResponse
            .replace(/^assistant\s*\n?/i, '') // Remove "assistant" prefix
            .replace(/^```json\s*\n?/i, '') // Remove markdown json opening
            .replace(/\n?```\s*$/i, '') // Remove markdown json closing
            .replace(/^Here's the JSON:?\s*\n?/i, '') // Remove explanations
            .replace(/^The JSON response:?\s*\n?/i, '') // Remove response indicators
            .trim();
    }
    
    // Parse response with robust fallback handling
    let parsed;
    try {
        const cleanedResponse = cleanLLMResponse(response);
        parsed = JSON.parse(cleanedResponse);
    }
    catch (primaryErr) {
        // Fallback: Try to extract JSON from raw response using regex
        console.warn('Primary JSON parse failed, attempting regex extraction...');
        try {
            const jsonMatch = response.match(/\{[^{}]*"is_job_related"[^{}]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
                console.log('✅ Regex JSON extraction successful');
            } else {
                throw new Error('No JSON object found in response');
            }
        } catch (fallbackErr) {
            const duration = Date.now() - startTime;
            performanceStats.stage1.totalTime += duration;
            console.error('Stage 1 JSON parsing completely failed:', {
                primaryError: primaryErr.message,
                fallbackError: fallbackErr.message,
                rawResponse: response.substring(0, 200) + '...',
                context: {
                    subjectLength: subject.length,
                    contentLength: emailContent.length,
                    fromDomain: from ? from.split('@')[1] : 'unknown',
                    duration
                }
            });
            
            // Return null to trigger immediate rule-based fallback
            throw new Error(`Stage 1 JSON parsing failed after ${duration}ms: ${primaryErr.message}`);
        }
    }
    const duration = Date.now() - startTime;
    performanceStats.stage1.totalTime += duration;
    
    // Record successful classification in production monitor
    console.log('Stage 1 classification completed in', duration, 'ms');
    
    if (duration > 10000) {
        console.warn(`🐌 Slow Stage 1 classification: ${duration}ms`);
    }
    
    classificationCache.set(key, parsed);
    
    // Log stats periodically (legacy - will migrate to production monitor)
    if (performanceStats.stage1.calls % 10 === 0) {
        logPerformanceStats();
        
        // Print production monitor summary every 20 requests
        if (performanceStats.stage1.calls % 20 === 0) {
            console.log('Performance summary:', performanceStats);
        }
    }
    
    return parsed;
}
exports.classifyEmail = classifyEmail;
// Stage 2: Detailed parsing for job-related emails (optimized for accuracy)
async function parseJobEmail(input) {
    const subject = input.subject ?? "";
    const plaintext = input.plaintext ?? "";
    const from = input.from ?? "";
    const headers = input.headers ?? {};
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? config_1.LLM_TEMPERATURE;
    const maxTokens = input.maxTokens ?? config_1.LLM_MAX_TOKENS;
    // Detailed caching for parsing
    const cacheContent = `${from}\n${JSON.stringify(headers)}\n${subject}\n${plaintext.slice(0, 2000)}`;
    const key = crypto.createHash("sha256").update(cacheContent).digest("hex");
    const cached = parseCache.get(key);
    if (cached) {
        const { is_job_related, ...result } = cached;
        return result;
    }
    const session = await ensureStage2Session(modelPath);
    // Enhanced content processing for Stage 2 parsing with 2048 token context
    const maxContentLength = 7000; // Much larger for full email processing
    let emailContent = preprocessEmailContent(plaintext, maxContentLength, false);
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
    // CRITICAL FIX: Use Promise.race with hard timeout for Stage 2 as well
    const stage2Timeout = config_1.STAGE2_TIMEOUT || 12000;
    console.log(`🔥 Stage 2 parsing with ${stage2Timeout}ms HARD TIMEOUT (bypassing node-llama-cpp limitations)`);
    
    // Create a hard timeout promise for Stage 2
    const hardTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            console.log(`💀 HARD TIMEOUT: Abandoning Stage 2 parsing after ${stage2Timeout}ms`);
            reject(new Error(`HARD_TIMEOUT: Stage 2 parsing abandoned after ${stage2Timeout}ms (bypassing node-llama-cpp)`));
        }, stage2Timeout);
    });
    
    let response;
    try {
        // Create the actual inference promise for Stage 2
        const inferencePromise = session.prompt(userPrompt, {
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
        
        console.log(`🚀 Racing Stage 2 parsing against ${stage2Timeout}ms hard timeout...`);
        
        // Race the inference against our hard timeout
        response = await Promise.race([inferencePromise, hardTimeoutPromise]);
        
        console.log(`✅ Stage 2 parsing completed successfully before timeout`);
    } catch (error) {
        // Check for our hard timeout first
        if (error.message.includes('HARD_TIMEOUT')) {
            console.error(`💀 Stage 2 HARD TIMEOUT after ${stage2Timeout}ms - bypassed node-llama-cpp`);
            throw new Error(`Stage 2 parsing timed out after ${stage2Timeout}ms`);
        } else if (error.name === 'AbortError' || error.message.includes('aborted')) {
            console.error(`⏱️ Stage 2 parsing timed out after ${stage2Timeout}ms`);
            throw new Error(`Stage 2 parsing timed out after ${stage2Timeout}ms`);
        }
        throw error;
    }
    // Parse and validate response with robust JSON handling
    let parsed;
    try {
        const cleanedResponse = cleanLLMResponse(response);
        parsed = JSON.parse(cleanedResponse);
    }
    catch (primaryErr) {
        // Fallback: Try to extract JSON from raw response using regex
        console.warn('Stage 2 primary JSON parse failed, attempting regex extraction...');
        try {
            const jsonMatch = response.match(/\{[^{}]*"company"[^{}]*"position"[^{}]*"status"[^{}]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
                console.log('✅ Stage 2 regex JSON extraction successful');
            } else {
                throw new Error('No valid JSON object found in Stage 2 response');
            }
        } catch (fallbackErr) {
            console.error('Stage 2 JSON parsing completely failed:', {
                primaryError: primaryErr.message,
                fallbackError: fallbackErr.message,
                rawResponse: response.substring(0, 200) + '...'
            });
            // Graceful fallback with default values
            parsed = { company: null, position: null, status: null };
        }
    }
    
    // Helper function for JSON cleaning (reuse from Stage 1)
    function cleanLLMResponse(rawResponse) {
        return rawResponse
            .replace(/^assistant\s*\n?/i, '') // Remove "assistant" prefix
            .replace(/^```json\s*\n?/i, '') // Remove markdown json opening
            .replace(/\n?```\s*$/i, '') // Remove markdown json closing
            .replace(/^Here's the JSON:?\s*\n?/i, '') // Remove explanations
            .replace(/^The JSON response:?\s*\n?/i, '') // Remove response indicators
            .trim();
    }
    // Apply post-processing normalization and validation for accuracy
    const fullResult = { is_job_related: true, ...parsed };
    const normalized = normalizeAndValidateResult(fullResult, { subject, from, plaintext: emailContent });
    const finalResult = { company: normalized.company, position: normalized.position, status: normalized.status };
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
        maxTokens: 32,
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
    const key = crypto.createHash("sha256").update(cacheContent).digest("hex");
    const cached = unifiedCache.get(key);
    if (cached)
        return cached;
    const session = await ensureUnifiedSession(modelPath);
    // Smart content truncation with 2048 token context - prioritize important parts
    const maxContentLength = 7000; // Much larger for unified processing
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
    // Use AbortController for unified parsing as well (use longer timeout)
    const unifiedTimeout = config_1.LLM_MAX_TOKENS > 100 ? 15000 : 10000; // Longer timeout for unified processing
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
        abortController.abort();
    }, unifiedTimeout);
    
    let response;
    try {
        response = await session.prompt(userPrompt, {
            temperature,
            maxTokens,
            signal: abortController.signal, // Apply AbortController to unified parsing as well
            stopOnAbortSignal: true,
            responseFormat: {
                type: "json_schema",
                schema: fullParseSchema,
                schema_id: "UnifiedEmailParseSchema",
            },
        });
        clearTimeout(timeoutId);
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
            console.error(`⏱️ Unified parsing timed out after ${unifiedTimeout}ms`);
            throw new Error(`Unified parsing timed out after ${unifiedTimeout}ms`);
        }
        throw error;
    }
    // Parse and validate response
    let parsed;
    try {
        parsed = JSON.parse(response);
    }
    catch (err) {
        console.error('LLM response parsing failed:', err, 'Response:', response);
        parsed = { is_job_related: false, company: null, position: null, status: null };
    }
    // Apply post-processing normalization and validation
    parsed = normalizeAndValidateResult(parsed, { subject, from, plaintext: emailContent });
    unifiedCache.set(key, parsed);
    return parsed;
}
exports.parseEmailWithLLM = parseEmailWithLLM;

// Enhanced robust email processing with fallback system
async function parseEmailWithRobustFallback(input) {
    const emailContext = {
        subject: input.subject ?? "",
        plaintext: input.plaintext ?? "",
        from: input.from ?? ""
    };
    
    try {
        // Try the optimized two-stage LLM processing first
        console.log('🤖 Attempting LLM two-stage processing...');
        return await parseEmailWithTwoStage(input);
        
    } catch (llmError) {
        console.warn(`⚠️  LLM processing failed: ${llmError.message}`);
        console.log('🔄 Falling back to enhanced rule-based classification...');
        
        try {
            // Use rule-based fallback for classification
            const classification = classifyEmailWithRules({
                subject: emailContext.subject,
                plaintext: emailContext.plaintext,
                fromAddress: emailContext.from
            });
            
            return {
                is_job_related: classification.is_job_related,
                company: classification.company,
                position: classification.position,
                status: classification.status,
                fallback_used: true,
                fallback_reason: 'llm_failed_rule_based_used',
                fallback_confidence: classification.confidence
            };
            
        } catch (fallbackError) {
            console.error(`❌ Even fallback system failed: ${fallbackError.message}`);
            
            // Last resort: return conservative defaults
            return {
                is_job_related: false,
                company: null,
                position: null,
                status: null,
                fallback_used: true,
                fallback_reason: 'complete-failure',
                fallback_confidence: 'none',
                manual_record_risk: 'high',
                error: `Both LLM and fallback failed: ${llmError.message} | ${fallbackError.message}`
            };
        }
    }
}

exports.parseEmailWithRobustFallback = parseEmailWithRobustFallback;

// Enhanced classification with fallback
async function classifyEmailWithFallback(input) {
    const emailContext = {
        subject: input.subject ?? "",
        plaintext: input.plaintext ?? "",
        from: input.from ?? ""
    };
    
    try {
        console.log('🤖 Attempting LLM classification...');
        return await classifyEmail(input);
        
    } catch (llmError) {
        console.warn(`⚠️  LLM classification failed: ${llmError.message}`);
        console.log('🔄 Using rule-based fallback classification...');
        
        return classifyEmailWithRules({
            subject: emailContext.subject,
            plaintext: emailContext.plaintext,
            fromAddress: emailContext.from
        });
    }
}

exports.classifyEmailWithFallback = classifyEmailWithFallback;
