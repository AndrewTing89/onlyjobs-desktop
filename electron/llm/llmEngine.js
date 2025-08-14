"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEmailWithLLM = void 0;
const crypto_1 = require("crypto");
const config_1 = require("./config");
const rules_1 = require("./rules");
const { isIndeedEmail, parseIndeedEmail } = require("./indeedHandler");

/**
 * Decode HTML entities and clean email content for LLM processing
 * This is critical to prevent extraction of HTML-encoded garbage as company names
 */
function cleanEmailContent(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    
    let cleaned = text;
    
    // Decode common HTML entities
    const htmlEntities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&nbsp;': ' ',
        '&rsquo;': "'",
        '&lsquo;': "'",
        '&rdquo;': '"',
        '&ldquo;': '"',
        '&mdash;': '—',
        '&ndash;': '–',
        '&hellip;': '...',
        '&copy;': '©',
        '&reg;': '®',
        '&trade;': '™'
    };
    
    // Replace HTML entities
    for (const [entity, replacement] of Object.entries(htmlEntities)) {
        cleaned = cleaned.replace(new RegExp(entity, 'g'), replacement);
    }
    
    // Decode numeric HTML entities (&#123; and &#x1F;)
    cleaned = cleaned.replace(/&#(\d+);/g, (match, dec) => {
        try {
            return String.fromCharCode(parseInt(dec, 10));
        } catch {
            return match;
        }
    });
    
    cleaned = cleaned.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
        try {
            return String.fromCharCode(parseInt(hex, 16));
        } catch {
            return match;
        }
    });
    
    // Remove remaining HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace and formatting
    cleaned = cleaned.replace(/\s+/g, ' '); // Multiple spaces -> single space
    cleaned = cleaned.replace(/\n\s*\n/g, '\n'); // Multiple newlines -> single newline
    cleaned = cleaned.trim();
    
    return cleaned;
}
// We import lazily since node-llama-cpp is heavy
let llamaModule = null;
let loadedSession = null; // LlamaChatSession
let loadedContext = null; // LlamaContext
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
const SYSTEM_PROMPT = [
    "Classify job emails. JSON only: {\"is_job_related\":bool,\"company\":str|null,\"position\":str|null,\"status\":str|null}",
    "",
    "Rules:",
    "- is_job_related=true: applications,interviews,offers,rejections",
    "- is_job_related=false: newsletters,marketing", 
    "- STATUS: Applied>Interview>Declined>Offer>null",
    "- COMPANY: hiring company (NOT Indeed/LinkedIn)",
    "- POSITION: job title from email",
    "",
    "Indeed emails: Extract company from 'Application submitted,[TITLE],[COMPANY] - [Location]' pattern",
    "",
    "Examples:",
    "'Application received for Engineer' → {\"is_job_related\":true,\"company\":null,\"position\":\"Engineer\",\"status\":\"Applied\"}",
    "'pursue other candidates' → {\"is_job_related\":true,\"company\":null,\"position\":null,\"status\":\"Declined\"}",
].join("\n");
const cache = new Map();
function makeCacheKey(subject, plaintext) {
    const canonical = subject + "\n" + plaintext.slice(0, 1000);
    return crypto_1.createHash("sha256").update(canonical).digest("hex");
}



/**
 * Extract JSON from LLM response, handling markdown code blocks and Python-style booleans
 */
function extractJSON(response) {
    if (!response || typeof response !== 'string') {
        return null;
    }
    
    let jsonString = response.trim();
    
    // Handle markdown code blocks
    const markdownMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        jsonString = markdownMatch[1].trim();
    }
    
    // Try to find JSON object
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        jsonString = jsonMatch[0];
    }
    
    // Fix Python-style booleans (common LLM mistake)
    jsonString = jsonString.replace(/:\s*True\b/g, ': true');
    jsonString = jsonString.replace(/:\s*False\b/g, ': false');
    jsonString = jsonString.replace(/:\s*None\b/g, ': null');
    
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.log('JSON parsing failed:', error.message);
        console.log('Raw response:', jsonString.substring(0, 200));
        return null;
    }
}

/**
 * Clean and normalize position titles extracted by LLM
 * Handles job codes, spacing issues, and formatting problems
 */
function cleanPositionTitle(position) {
    if (!position || typeof position !== 'string') {
        return null;
    }
    
    let cleaned = position.trim();
    
    // Remove job codes and IDs (various patterns)
    cleaned = cleaned.replace(/\b[A-Z]_?\d{4,}\b/g, ''); // R_123456, R123456
    cleaned = cleaned.replace(/\b[A-Z]{2,}\d{4,}\b/g, ''); // REQ123456
    cleaned = cleaned.replace(/-\d{6,}$/g, ''); // -25013397 at end
    cleaned = cleaned.replace(/\(\d+\)$/g, ''); // (123456) at end
    
    // Fix spacing issues
    cleaned = cleaned.replace(/\s*-\s*/g, ' - '); // Fix "Analysis -Specialist" -> "Analysis - Specialist"
    cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2'); // Fix "theAnalytics" -> "the Analytics"
    cleaned = cleaned.replace(/\bthe([A-Z])/g, '$1'); // Fix "theAnalytics" -> "Analytics"
    
    // Clean up extra spaces and punctuation
    cleaned = cleaned.replace(/\s+/g, ' '); // Multiple spaces -> single space
    cleaned = cleaned.replace(/^[\s\-]+|[\s\-]+$/g, ''); // Trim spaces and dashes
    cleaned = cleaned.replace(/\s*-\s*$/, ''); // Remove trailing " -"
    
    // Filter out phrases that are not actual job positions
    const nonPositionPhrases = [
        /^talent acquisition team?$/i,
        /^hr team?$/i,
        /^hiring team?$/i,
        /^recruiting team?$/i,
        /^human resources?$/i,
        /^our team$/i,
        /^the team$/i,
        /^department$/i,
        /^team$/i
    ];
    
    if (nonPositionPhrases.some(pattern => pattern.test(cleaned))) {
        return null;
    }
    
    // Return null if nothing meaningful remains
    if (!cleaned || cleaned.length < 2 || /^[\s\-\(\)]*$/.test(cleaned)) {
        return null;
    }
    
    return cleaned;
}

/**
 * Check if a company name is actually a job board platform or invalid extraction
 */
function isJobBoardName(company) {
    if (!company || typeof company !== 'string') {
        return false;
    }
    
    const lowercaseCompany = company.toLowerCase().trim();
    
    // Job board platforms
    const jobBoards = [
        'indeed', 'linkedin', 'ziprecruiter', 'monster', 'glassdoor',
        'careerbuilder', 'dice', 'simplyhired', 'snagajob', 'flexjobs'
    ];
    
    // Generic phrases that are not company names
    const genericPhrases = [
        'talent acquisition', 'talent acquisition team', 'our talent acquisition team', 
        'data strategy & communication', 'floor 36', 'human resources', 'hr department', 
        'recruiting team', 'hiring manager', 'people team', 'we encourage you', 
        'continue exploring', 'opportunities with our firm', 'unable to speak with everyone',
        'meantime', 'learn more about our', 'nextgen', 'next', 'our team',
        'application submitted', 'good luck'
    ];
    
    // Check job boards
    if (jobBoards.some(board => lowercaseCompany.includes(board))) {
        return true;
    }
    
    // Check generic phrases
    if (genericPhrases.some(phrase => lowercaseCompany.includes(phrase))) {
        return true;
    }
    
    // Check if it's a sentence or long phrase (likely email body text)
    if (company.length > 50 || company.split(' ').length > 5) {
        return true;
    }
    
    // Check for common indicators of email body text
    if (lowercaseCompany.includes('you') || lowercaseCompany.includes('we') || 
        lowercaseCompany.includes('your') || lowercaseCompany.includes('our')) {
        return true;
    }
    
    return false;
}

/**
 * Enhanced company name cleaning and validation
 */
function cleanCompanyName(company) {
    if (!company || typeof company !== 'string') {
        return null;
    }
    
    let cleaned = company.trim();
    
    // Remove HTML artifacts that might have escaped cleaning
    cleaned = cleaned.replace(/&[a-zA-Z0-9#]+;/g, ' ');
    
    // Remove common suffixes that might be extracted incorrectly
    cleaned = cleaned.replace(/\s+(talent acquisition|team|department|hr)$/i, '');
    
    // Remove location indicators
    cleaned = cleaned.replace(/\s*-\s*[A-Z][a-z\s,]+$/i, ''); // "Company - San Francisco, CA"
    
    // Clean up spaces and punctuation
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Validate the result
    if (isJobBoardName(cleaned) || cleaned.length < 2) {
        return null;
    }
    
    return cleaned;
}

/**
 * Extract actual company name from job board emails
 */
function extractCompanyFromJobBoard(subject, plaintext) {
    // Indeed-specific patterns based on actual email structure
    
    // Pattern 1: Most reliable - "The following items were sent to [COMPANY]. Good luck!"
    const indeedSentToPattern = /(?:The following items were sent to|sent to)\s+([^.\n]+?)\.?\s*(?:Good luck|$)/i;
    const sentToMatch = plaintext.match(indeedSentToPattern);
    
    if (sentToMatch && sentToMatch[1]) {
        const company = sentToMatch[1].trim();
        if (!isJobBoardName(company) && company.length > 1) {
            return company;
        }
    }
    
    // Pattern 2: Indeed structure with comma separation
    // "Application submitted\n[POSITION]\n[COMPANY] - [LOCATION]" OR
    // "Application submitted, [POSITION], [COMPANY] - [LOCATION]"
    const indeedCommaPattern = /Application submitted[,\s]*\n?[,\s]*([^\n,]+)[,\s]*\n?[,\s]*([^-\n,]+?)\s*-\s*([^,\n]+)/i;
    const commaMatch = plaintext.match(indeedCommaPattern);
    
    if (commaMatch && commaMatch[2]) {
        const company = commaMatch[2].trim();
        if (!isJobBoardName(company) && company.length > 1 && company.length < 50) {
            return company;
        }
    }
    
    // Pattern 3: Line-by-line parsing for "[COMPANY] - [LOCATION]"
    const lines = plaintext.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        // Skip lines that are too short or start with common non-company text
        if (trimmedLine.length < 3 || 
            /^(Application|star rating|reviews?|company logo|Good luck|The following)/i.test(trimmedLine)) {
            continue;
        }
        
        // Match pattern: [COMPANY] - [LOCATION]
        const companyLocationMatch = trimmedLine.match(/^([^-\n]+?)\s*-\s*[A-Za-z\s,]+$/);
        if (companyLocationMatch && companyLocationMatch[1]) {
            const company = companyLocationMatch[1].trim();
            // Validate it's a reasonable company name
            if (!isJobBoardName(company) && 
                company.length > 1 && 
                company.length < 50 &&
                !/^(Application|star|rating|\d+)/i.test(company)) {
                return company;
            }
        }
    }
    
    // Pattern 4: Legacy pattern for backward compatibility
    const indeedStructurePattern = /Application submitted\s*\n\s*([^\n]+)\s*\n\s*([^-\n]+?)\s*-/i;
    const structureMatch = plaintext.match(indeedStructurePattern);
    
    if (structureMatch && structureMatch[2]) {
        const company = structureMatch[2].trim();
        if (!isJobBoardName(company) && company.length > 1) {
            return company;
        }
    }
    
    // Pattern 4: General fallback patterns for other job boards
    
    // LinkedIn and general "at [COMPANY]" pattern
    const linkedinPattern = /\bat\s+([^,\n\.]+?)(?=\s+(?:has been sent|through|via|\.|$))/i;
    const linkedinMatch = plaintext.match(linkedinPattern);
    
    if (linkedinMatch && linkedinMatch[1]) {
        const company = linkedinMatch[1].trim();
        if (!isJobBoardName(company) && company.length > 2) {
            return company;
        }
    }
    
    // General "position at [COMPANY]" pattern for various job boards
    const generalAtPattern = /(?:position|role|job)\s+at\s+([A-Z][A-Za-z\s&]+?)(?:\.\s|\n|\s+[a-z])/i;
    const generalAtMatch = plaintext.match(generalAtPattern);
    
    if (generalAtMatch && generalAtMatch[1]) {
        const company = generalAtMatch[1].trim();
        if (!isJobBoardName(company) && 
            company.length > 2 && 
            company.length < 50 &&
            !/\b(Inc|LLC|Corp|Ltd|Department|Team|HR)\b/i.test(company)) {
            return company;
        }
    }
    
    // ZipRecruiter/Monster pattern: "[TITLE] at [COMPANY]" or "[TITLE], [COMPANY]"
    const generalPattern = /(?:at|,)\s+([A-Z][^,\n\-\.]{2,40})(?:\s*[-,\n]|$)/;
    const generalMatch = plaintext.match(generalPattern);
    
    if (generalMatch && generalMatch[1]) {
        const company = generalMatch[1].trim();
        if (!isJobBoardName(company) && 
            company.length > 2 && 
            !/\b(Inc|LLC|Corp|Ltd|Department|Team|HR)\b/i.test(company)) {
            return company;
        }
    }
    
    return null;
}
async function ensureSession(modelPath) {
    if (loadedSession && loadedModelPath === modelPath)
        return loadedSession;
    const module = await loadLlamaModule();
    const { getLlama, LlamaModel, LlamaContext, LlamaChatSession } = module;
    const llama = await getLlama();
    loadedModel = await llama.loadModel({ modelPath });
    loadedContext = await loadedModel.createContext({ contextSize: config_1.LLM_CONTEXT, batchSize: 512 });
    const sequence = loadedContext.getSequence();
    loadedSession = new LlamaChatSession({ contextSequence: sequence, systemPrompt: SYSTEM_PROMPT });
    loadedModelPath = modelPath;
    return loadedSession;
}
async function parseEmailWithLLM(input) {
    // Check if this is an Indeed email and route to specialized handler
    if (isIndeedEmail(input)) {
        console.log('🎯 Routing Indeed email to specialized handler');
        try {
            return await parseIndeedEmail(input);
        } catch (error) {
            console.log('⚠️ Indeed handler failed, falling back to generic LLM:', error.message);
            // Continue with generic processing below
        }
    }

    const subject = cleanEmailContent(input.subject ?? "");
    const plaintext = cleanEmailContent(input.plaintext ?? "");
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? config_1.LLM_TEMPERATURE;
    const maxTokens = input.maxTokens ?? config_1.LLM_MAX_TOKENS;
    const key = makeCacheKey(subject, plaintext);
    const cached = cache.get(key);
    if (cached)
        return cached;

    // Route to specialized Indeed handler if applicable
    if (isIndeedEmail(input)) {
        console.log('🎯 Routing to specialized Indeed handler');
        try {
            const indeedResult = await parseIndeedEmail({
                ...input,
                subject,
                plaintext,
                modelPath,
                temperature,
                maxTokens
            });
            
            // Cache the result and return
            cache.set(key, indeedResult);
            return indeedResult;
        } catch (indeedError) {
            console.warn('Indeed handler failed, falling back to generic LLM:', indeedError.message);
            // Continue to generic processing if Indeed handler fails
        }
    }
    const session = await ensureSession(modelPath);
    const hint = (0, rules_1.getStatusHint)(subject, plaintext);
    // Clean and truncate email content to prevent context overflow
    const cleanedPlaintext = cleanEmailContent(plaintext);
    const maxBodyLength = 1200; // Leave more room for prompt
    const truncatedBody = cleanedPlaintext.length > maxBodyLength 
        ? cleanedPlaintext.substring(0, maxBodyLength) + "... [truncated]"
        : cleanedPlaintext;
    
    const userPrompt = [
        hint ? `${hint}` : null,
        `Input`,
        `Subject: ${subject}`,
        `Body: ${truncatedBody}`,
        `Output`,
    ]
        .filter(Boolean)
        .join("\n");
    const response = await session.prompt(userPrompt, {
        temperature,
        maxTokens,
        responseFormat: {
            type: "json_schema",
            schema,
            schema_id: "OnlyJobsEmailParseSchema",
        },
    });
    // Parse response with robust JSON extraction
    let parsed = extractJSON(response);
    if (!parsed) {
        // Fallback for failed parsing
        parsed = { is_job_related: false, company: null, position: null, status: null };
    }
    // Enforce rules: if not job-related, everything else null
    if (!parsed.is_job_related) {
        parsed.company = null;
        parsed.position = null;
        parsed.status = null;
    }
    // Never return 'unknown' strings or literal "null"
    if (parsed.company && (/^unknown$/i.test(parsed.company) || parsed.company === "null"))
        parsed.company = null;
    if (parsed.position && (/^unknown$/i.test(parsed.position) || parsed.position === "null"))
        parsed.position = null;
    
    // Enhanced position cleanup and extraction
    if (parsed.position) {
        parsed.position = cleanPositionTitle(parsed.position);
    }
    
    // Enhanced company extraction and cleaning
    if (parsed.company) {
        parsed.company = cleanCompanyName(parsed.company);
    }
    
    // Try extracting from job board emails if no valid company found
    if (!parsed.company) {
        const extractedCompany = extractCompanyFromJobBoard(subject, plaintext);
        if (extractedCompany) {
            parsed.company = cleanCompanyName(extractedCompany);
        }
    }
    
    cache.set(key, parsed);
    return parsed;
}
// Stage 1 Prompt: Fast job classification (compressed)
const STAGE1_SYSTEM_PROMPT = [
    "Classify emails. Output ONLY JSON: {\"is_job_related\":boolean}",
    "Job-related: applications, recruiting, interviews, offers, rejections = true",
    "Not job-related: newsletters, marketing, personal = false",
].join("\n");

const stage1Schema = {
    type: "object",
    properties: {
        is_job_related: { type: "boolean" }
    },
    required: ["is_job_related"],
    additionalProperties: false,
};

// Stage 2 Prompt: Compact extraction optimized for Indeed
const STAGE2_SYSTEM_PROMPT = [
    "Extract job data. JSON: {\"company\":str|null,\"position\":str|null,\"status\":str|null}",
    "STATUS: Applied('received','submitted')>Declined('pursue other')>Interview>Offer>null",
    "POSITION: job title, clean codes (R_123)",
    "COMPANY: hiring company, NOT job boards",
    "Indeed pattern: 'Application submitted,[TITLE],[COMPANY] - [Location]' → extract COMPANY",
].join("\n");

const stage2Schema = {
    type: "object",
    properties: {
        company: { type: ["string", "null"] },
        position: { type: ["string", "null"] },
        status: { type: ["string", "null"], enum: ["Applied", "Interview", "Declined", "Offer", null] }
    },
    required: ["company", "position", "status"],
    additionalProperties: false,
};

async function parseEmailWithTwoStage(input) {
    // Check if this is an Indeed email and route to specialized handler
    if (isIndeedEmail(input)) {
        console.log('🎯 Routing Indeed email to specialized handler');
        try {
            return await parseIndeedEmail(input);
        } catch (error) {
            console.log('⚠️ Indeed handler failed, falling back to two-stage LLM:', error.message);
            // Continue with two-stage processing below
        }
    }

    const subject = cleanEmailContent(input.subject ?? "");
    const plaintext = cleanEmailContent(input.plaintext ?? "");
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? config_1.LLM_TEMPERATURE;
    const maxTokens = input.maxTokens ?? config_1.LLM_MAX_TOKENS;

    // Check cache first
    const key = makeCacheKey(subject, plaintext);
    const cached = cache.get(key);
    if (cached) return cached;

    // Route to specialized Indeed handler if applicable (faster than two-stage)
    if (isIndeedEmail(input)) {
        console.log('🎯 Routing to specialized Indeed handler (bypassing two-stage)');
        try {
            const indeedResult = await parseIndeedEmail({
                ...input,
                subject,
                plaintext,
                modelPath,
                temperature,
                maxTokens
            });
            
            // Cache the result and return
            cache.set(key, indeedResult);
            return indeedResult;
        } catch (indeedError) {
            console.warn('Indeed handler failed, continuing with two-stage approach:', indeedError.message);
            // Continue to two-stage processing if Indeed handler fails
        }
    }

    // Clean and truncate email content to prevent context overflow
    const cleanedPlaintext = cleanEmailContent(plaintext);
    const maxBodyLength = 1200; // Reduced for smaller context
    const truncatedBody = cleanedPlaintext.length > maxBodyLength 
        ? cleanedPlaintext.substring(0, maxBodyLength) + "... [truncated]"
        : cleanedPlaintext;

    // Memory-efficient approach: Try to reuse existing model/context
    let stage1Context = null;
    let stage2Context = null;
    
    try {
        // Stage 1: Fast job classification with smaller context
        console.log('🚀 Stage 1: Fast job classification');
        
        // Use smaller context size for stage 1 to conserve VRAM
        const module = await loadLlamaModule();
        const { getLlama, LlamaModel, LlamaContext, LlamaChatSession } = module;
        
        // Ensure model is loaded
        if (!loadedModel) {
            const llama = await getLlama();
            loadedModel = await llama.loadModel({ modelPath });
        }
        
        // Create minimal context for stage 1 (classification only needs ~200 tokens)
        stage1Context = await loadedModel.createContext({ 
            contextSize: Math.min(512, config_1.LLM_CONTEXT), 
            batchSize: 256 
        });
        const stage1Sequence = stage1Context.getSequence();
        const stage1ChatSession = new LlamaChatSession({ 
            contextSequence: stage1Sequence, 
            systemPrompt: STAGE1_SYSTEM_PROMPT 
        });

        const stage1Input = `Input\nSubject: ${subject}\nBody: ${truncatedBody}\nOutput`;
        
        const stage1Response = await stage1ChatSession.prompt(stage1Input, {
            temperature: 0.1, // Lower temperature for classification
            maxTokens: 50,
            responseFormat: {
                type: "json_schema",
                schema: stage1Schema,
                schema_id: "Stage1ClassificationSchema"
            }
        });

        // Parse stage 1 response with robust JSON extraction
        let stage1Result = extractJSON(stage1Response);
        if (!stage1Result) {
            stage1Result = { is_job_related: false };
        }

        // Cleanup stage 1 context immediately to free VRAM
        if (stage1Context) {
            try {
                stage1Context.dispose();
            } catch (err) {
                console.warn('Failed to dispose stage1Context:', err.message);
            }
        }

        // If not job-related, return early (no stage 2 needed)
        if (!stage1Result.is_job_related) {
            const result = {
                is_job_related: false,
                company: null,
                position: null,
                status: null
            };
            cache.set(key, result);
            return result;
        }

        // Stage 2: Detailed parsing with enhanced prompts
        console.log('🎯 Stage 2: Detailed parsing and extraction');
        
        // Create stage 2 context with slightly larger size for extraction
        stage2Context = await loadedModel.createContext({ 
            contextSize: Math.min(768, config_1.LLM_CONTEXT), 
            batchSize: 256 
        });
        const stage2Sequence = stage2Context.getSequence();
        const stage2ChatSession = new LlamaChatSession({ 
            contextSequence: stage2Sequence, 
            systemPrompt: STAGE2_SYSTEM_PROMPT 
        });

        // Get hint from rules for additional context
        const hint = (0, rules_1.getStatusHint)(subject, plaintext);
        
        const stage2Input = [
            hint ? `Status Hint: ${hint}` : null,
            `Input`,
            `Subject: ${subject}`,
            `Body: ${truncatedBody}`,
            `Output`
        ].filter(Boolean).join("\n");

        const stage2Response = await stage2ChatSession.prompt(stage2Input, {
            temperature: 0.2, // Slightly higher for extraction
            maxTokens: 200,
            responseFormat: {
                type: "json_schema",  
                schema: stage2Schema,
                schema_id: "Stage2ParsingSchema"
            }
        });

        // Parse stage 2 response with robust JSON extraction
        let stage2Result = extractJSON(stage2Response);
        if (!stage2Result) {
            stage2Result = { company: null, position: null, status: null };
        }

        // Cleanup stage 2 context
        if (stage2Context) {
            try {
                stage2Context.dispose();
            } catch (err) {
                console.warn('Failed to dispose stage2Context:', err.message);
            }
        }

        // Clean up extracted values
        if (stage2Result.company && (/^unknown$/i.test(stage2Result.company) || stage2Result.company === "null")) {
            stage2Result.company = null;
        }
        if (stage2Result.position && (/^unknown$/i.test(stage2Result.position) || stage2Result.position === "null")) {
            stage2Result.position = null;
        }
        
        // Enhanced position cleanup
        if (stage2Result.position) {
            stage2Result.position = cleanPositionTitle(stage2Result.position);
        }
        
        // Enhanced company extraction and cleaning
        if (stage2Result.company) {
            stage2Result.company = cleanCompanyName(stage2Result.company);
        }
        
        // Try extracting from job board emails if no valid company found
        if (!stage2Result.company) {
            const extractedCompany = extractCompanyFromJobBoard(subject, truncatedBody);
            if (extractedCompany) {
                stage2Result.company = cleanCompanyName(extractedCompany);
            }
        }

        // Combine results
        let finalResult = {
            is_job_related: true, // We know it's job-related from stage 1
            company: stage2Result.company,
            position: stage2Result.position,
            status: stage2Result.status
        };

        // Fallback system: if Stage 2 failed to extract anything meaningful, use unified approach
        const hasValidExtraction = finalResult.company || finalResult.position || finalResult.status;
        
        if (!hasValidExtraction) {
            console.log('⚠️  Stage 2 extraction failed, falling back to unified approach');
            try {
                const fallbackResult = await parseEmailWithLLM({
                    subject,
                    plaintext: truncatedBody,
                    modelPath,
                    temperature,
                    maxTokens: maxTokens * 2 // Give unified approach more tokens
                });
                
                // Use fallback results if they're better
                if (fallbackResult && (fallbackResult.company || fallbackResult.position || fallbackResult.status)) {
                    finalResult = fallbackResult;
                    console.log('✅ Fallback extraction successful');
                }
            } catch (fallbackError) {
                console.log('❌ Fallback also failed:', fallbackError.message);
            }
        }

        cache.set(key, finalResult);
        return finalResult;
        
    } catch (error) {
        // Cleanup contexts on error
        if (stage1Context) {
            try { stage1Context.dispose(); } catch {}
        }
        if (stage2Context) {
            try { stage2Context.dispose(); } catch {}
        }
        
        // If VRAM error, fall back to unified approach with smaller context
        if (error.message.includes('InsufficientMemoryError') || error.message.includes('VRAM') || error.message.includes('memory')) {
            console.log('💾 VRAM insufficient for two-stage approach, falling back to unified with smaller context');
            try {
                return await parseEmailWithLLM({
                    subject,
                    plaintext: truncatedBody,
                    modelPath,
                    temperature,
                    maxTokens: Math.min(maxTokens, 128) // Reduce tokens for memory-constrained systems
                });
            } catch (fallbackError) {
                console.error('❌ Unified fallback also failed:', fallbackError.message);
                // Return conservative result
                const conservativeResult = {
                    is_job_related: false,
                    company: null,
                    position: null,
                    status: null
                };
                cache.set(key, conservativeResult);
                return conservativeResult;
            }
        }
        
        throw error;
    }
}

// Legacy aliases for backward compatibility
const classifyEmail = parseEmailWithLLM;
const parseJobEmail = parseEmailWithTwoStage;

exports.parseEmailWithLLM = parseEmailWithLLM;
exports.parseEmailWithTwoStage = parseEmailWithTwoStage;
exports.classifyEmail = classifyEmail;
exports.parseJobEmail = parseJobEmail;
