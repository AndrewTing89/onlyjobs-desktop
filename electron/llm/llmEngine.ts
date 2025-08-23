import crypto from "crypto";
import { DEFAULT_MODEL_PATH, LLM_TEMPERATURE, LLM_MAX_TOKENS, LLM_CONTEXT, GPU_LAYERS } from "./config";
import { getStatusHint } from "./rules";

// We import lazily since node-llama-cpp is heavy
let llamaModule: any | null = null;

// Stage 1 (Classification) session - optimized for speed
let stage1Session: any | null = null; // LlamaChatSession
let stage1Context: any | null = null; // LlamaContext

// Stage 2 (Parsing) session - optimized for accuracy
let stage2Session: any | null = null; // LlamaChatSession
let stage2Context: any | null = null; // LlamaContext

// Unified session (backward compatibility)
let unifiedSession: any | null = null; // LlamaChatSession
let unifiedContext: any | null = null; // LlamaContext

// Shared model and path tracking
let loadedModel: any | null = null;   // LlamaModel
let loadedModelPath: string | null = null;

// Session use counters to track when to reset
let stage1UseCount = 0;
let stage2UseCount = 0;
const MAX_SESSION_USES = 1; // Always create fresh sessions to avoid context issues completely

async function loadLlamaModule() {
  if (llamaModule) return llamaModule;
  
  try {
    llamaModule = await import('node-llama-cpp');
    return llamaModule;
  } catch (error) {
    throw new Error(
      "node-llama-cpp is not installed or failed to build. Run: npm i node-llama-cpp --legacy-peer-deps (or with --build-from-source)"
    );
  }
}

export type ParseResult = {
  is_job_related: boolean;
  company: string | null;
  position: string | null;
  status: "Applied" | "Interview" | "Declined" | "Offer" | null;
};

export type ClassificationResult = {
  is_job_related: boolean;
};

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

// Stage 1: Ultra-compact classification prompt for small context
const STAGE1_CLASSIFICATION_PROMPT = `Job classifier. Output JSON: {"is_job_related":boolean,"manual_record_risk":"none"|"low"|"medium"|"high"}

Job-related: Application confirmations, interviews, offers, rejections from companies
NOT job-related: Job alerts, recommendations, talent communities, newsletters

Examples:
"Application received" → {"is_job_related":true,"manual_record_risk":"low"}
"Your Job Alert matched" → {"is_job_related":false,"manual_record_risk":"none"}
"Interview invitation" → {"is_job_related":true,"manual_record_risk":"low"}

Output ONLY JSON.`;

// Stage 2: Optimized parsing prompt for small context
const STAGE2_PARSING_PROMPT = `Parse job email. Output JSON: {"company":string|null,"position":string|null,"status":"Applied"|"Interview"|"Declined"|"Offer"|null}

Company: Extract hiring organization (NOT job boards)
- Job boards: "Position, CompanyName - Location" → extract CompanyName  
- Regular: Look for actual employer name, not Indeed/LinkedIn/ZipRecruiter

Position: Clean job title
- Remove job codes: R123456, JR156260, (REQ-123)
- Keep: Sr., Senior, Principal, Lead, Manager

Status: Applied|Interview|Declined|Offer based on content

Examples:
"Indeed Application: Data Analyst" + "Application submitted, Data Analyst, Microsoft - Seattle" → {"company":"Microsoft","position":"Data Analyst","status":"Applied"}
"Application received for Engineer at Google" → {"company":"Google","position":"Engineer","status":"Applied"}
"Interview for Product Manager" → {"company":null,"position":"Product Manager","status":"Interview"}

Output ONLY JSON.`;

// Separate caches for different stages
const classificationCache = new Map<string, ClassificationResult>();
const parseCache = new Map<string, ParseResult>();
const unifiedCache = new Map<string, ParseResult>();

function makeCacheKey(subject: string, plaintext: string): string {
  const canonical = subject + "\n" + plaintext.slice(0, 1000);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

async function ensureModel(modelPath: string) {
  if (loadedModel && loadedModelPath === modelPath) return loadedModel;
  
  const module = await loadLlamaModule();
  const { getLlama } = module;
  const llama = await getLlama();
  loadedModel = await llama.loadModel({ modelPath });
  loadedModelPath = modelPath;
  return loadedModel;
}

// Stage 1: Fast classification session (small context, optimized for speed)
async function ensureStage1Session(modelPath: string) {
  const model = await ensureModel(modelPath);
  const module = await loadLlamaModule();
  const { LlamaContext, LlamaChatSession } = module;
  
  // Create context only if needed
  if (!stage1Context || loadedModelPath !== modelPath) {
    stage1Context = await model.createContext({ 
      contextSize: LLM_CONTEXT, // Use full context
      batchSize: 512 
    });
  }
  
  // Reuse session but reset if it gets too long to avoid context overflow
  if (!stage1Session || loadedModelPath !== modelPath || stage1UseCount >= MAX_SESSION_USES) {
    const sequence = stage1Context.getSequence();
    stage1Session = new LlamaChatSession({ 
      contextSequence: sequence, 
      systemPrompt: STAGE1_CLASSIFICATION_PROMPT 
    });
    stage1UseCount = 0;
  }
  
  stage1UseCount++;
  return stage1Session;
}

// Stage 2: Detailed parsing session (full context, optimized for accuracy)
async function ensureStage2Session(modelPath: string) {
  const model = await ensureModel(modelPath);
  const module = await loadLlamaModule();
  const { LlamaContext, LlamaChatSession } = module;
  
  // Create context only if needed
  if (!stage2Context || loadedModelPath !== modelPath) {
    stage2Context = await model.createContext({ 
      contextSize: LLM_CONTEXT, // Full context for accuracy
      batchSize: 512 
    });
  }
  
  // Reuse session but reset if it gets too long to avoid context overflow
  if (!stage2Session || loadedModelPath !== modelPath || stage2UseCount >= MAX_SESSION_USES) {
    const sequence = stage2Context.getSequence();
    stage2Session = new LlamaChatSession({ 
      contextSequence: sequence, 
      systemPrompt: STAGE2_PARSING_PROMPT 
    });
    stage2UseCount = 0;
  }
  
  stage2UseCount++;
  return stage2Session;
}

// Backward compatibility: Unified session
async function ensureUnifiedSession(modelPath: string) {
  if (unifiedSession && loadedModelPath === modelPath) return unifiedSession;

  const model = await ensureModel(modelPath);
  const module = await loadLlamaModule();
  const { LlamaContext, LlamaChatSession } = module;
  
  unifiedContext = await model.createContext({ 
    contextSize: LLM_CONTEXT, 
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
function normalizeAndValidateResult(
  parsed: ParseResult, 
  context: { subject: string; from: string; plaintext: string }
): ParseResult {
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
    } else if (statusLower.includes('interview') || statusLower.includes('screen')) {
      parsed.status = 'Interview';
    } else if (statusLower.includes('offer')) {
      parsed.status = 'Offer';
    } else if (statusLower.includes('appli') || statusLower.includes('submit')) {
      parsed.status = 'Applied';
    } else {
      parsed.status = null;
    }
  }

  return parsed;
}

// Enhanced ATS domain mapping
function extractCompanyFromATSDomain(from: string, plaintext: string): string | null {
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
    const match = from.match(/@([^.]+)\./)
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
        if (cleaned) return cleaned;
      }
    }
  }

  return null;
}

// Stage 1: Fast job classification (optimized for speed <1.8s)
export async function classifyEmail(input: {
  subject: string;
  plaintext: string;
  from?: string;
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ClassificationResult> {
  const subject = input.subject ?? "";
  const plaintext = input.plaintext ?? "";
  const from = input.from ?? "";
  const modelPath = input.modelPath ?? DEFAULT_MODEL_PATH;
  const temperature = input.temperature ?? 0.0; // Lower temperature for classification consistency
  const maxTokens = input.maxTokens ?? 32; // Very small for binary output

  // Ultra-fast caching for classification
  const cacheContent = `${from}\n${subject}\n${plaintext.slice(0, 500)}`; // Smaller cache key
  const key = crypto.createHash("sha256").update(cacheContent).digest("hex");
  const cached = classificationCache.get(key);
  if (cached) return cached;

  const session = await ensureStage1Session(modelPath);

  // Allow much larger emails for classification with 2048 token context
  const maxContentLength = 6000; // Increased for full email processing
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

  const response = await session.prompt(userPrompt, {
    temperature,
    maxTokens,
    responseFormat: {
      type: "json_schema",
      schema: classificationSchema,
      schema_id: "FastClassificationSchema",
    },
  });

  // Parse response
  let parsed: ClassificationResult;
  try {
    parsed = JSON.parse(response) as ClassificationResult;
  } catch (err) {
    console.error('Stage 1 classification parsing failed:', err, 'Response:', response);
    parsed = { is_job_related: false };
  }

  classificationCache.set(key, parsed);
  return parsed;
}

// Stage 2: Detailed parsing for job-related emails (optimized for accuracy)
export async function parseJobEmail(input: {
  subject: string;
  plaintext: string;
  from?: string;
  headers?: Record<string, string>;
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<Omit<ParseResult, 'is_job_related'>> {
  const subject = input.subject ?? "";
  const plaintext = input.plaintext ?? "";
  const from = input.from ?? "";
  const headers = input.headers ?? {};
  const modelPath = input.modelPath ?? DEFAULT_MODEL_PATH;
  const temperature = input.temperature ?? LLM_TEMPERATURE;
  const maxTokens = input.maxTokens ?? LLM_MAX_TOKENS;

  // Detailed caching for parsing
  const cacheContent = `${from}\n${JSON.stringify(headers)}\n${subject}\n${plaintext.slice(0, 2000)}`;
  const key = crypto.createHash("sha256").update(cacheContent).digest("hex");
  const cached = parseCache.get(key);
  if (cached) {
    const { is_job_related, ...result } = cached;
    return result;
  }

  const session = await ensureStage2Session(modelPath);

  // Full content processing for accuracy with 2048 token context
  const maxContentLength = 7000; // Much larger for full email processing
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

  const response = await session.prompt(userPrompt, {
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

  // Parse and validate response
  let parsed: Omit<ParseResult, 'is_job_related'>;
  try {
    parsed = JSON.parse(response) as Omit<ParseResult, 'is_job_related'>;
  } catch (err) {
    console.error('Stage 2 parsing failed:', err, 'Response:', response);
    parsed = { company: null, position: null, status: null };
  }

  // Apply post-processing normalization and validation for accuracy
  const fullResult: ParseResult = { is_job_related: true, ...parsed };
  const normalized = normalizeAndValidateResult(fullResult, { subject, from, plaintext: emailContent });
  const finalResult = { company: normalized.company, position: normalized.position, status: normalized.status };
  
  parseCache.set(key, { is_job_related: true, ...finalResult });
  return finalResult;
}

// Two-stage processing: Fast classification + detailed parsing
export async function parseEmailWithTwoStage(input: {
  subject: string;
  plaintext: string;
  from?: string;
  headers?: Record<string, string>;
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ParseResult> {
  // Stage 1: Fast classification
  const classification = await classifyEmail({
    subject: input.subject,
    plaintext: input.plaintext,
    from: input.from,
    modelPath: input.modelPath,
    temperature: 0.0, // Force consistency for classification
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

// Backward compatibility: Original unified function
export async function parseEmailWithLLM(input: {
  subject: string;
  plaintext: string;
  from?: string;  // Add optional from header for better context
  headers?: Record<string, string>; // Add optional full headers
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ParseResult> {
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
  const modelPath = input.modelPath ?? DEFAULT_MODEL_PATH;
  const temperature = input.temperature ?? LLM_TEMPERATURE;
  const maxTokens = input.maxTokens ?? LLM_MAX_TOKENS;

  // Include headers in cache key for more accurate caching
  const cacheContent = `${from}\n${subject}\n${plaintext.slice(0, 1000)}`;
  const key = crypto.createHash("sha256").update(cacheContent).digest("hex");
  const cached = unifiedCache.get(key);
  if (cached) return cached;

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

  const response = await session.prompt(userPrompt, {
    temperature,
    maxTokens,
    responseFormat: {
      type: "json_schema",
      schema: fullParseSchema,
      schema_id: "UnifiedEmailParseSchema",
    },
  });

  // Parse and validate response
  let parsed: ParseResult;
  try {
    parsed = JSON.parse(response) as ParseResult;
  } catch (err) {
    console.error('LLM response parsing failed:', err, 'Response:', response);
    parsed = { is_job_related: false, company: null, position: null, status: null };
  }

  // Apply post-processing normalization and validation
  parsed = normalizeAndValidateResult(parsed, { subject, from, plaintext: emailContent });

  unifiedCache.set(key, parsed);
  return parsed;
}