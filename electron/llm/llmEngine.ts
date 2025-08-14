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
  },
  required: ["is_job_related"],
  additionalProperties: false,
};

// Stage 1: Ultra-fast job classification prompt (optimized for speed)
const STAGE1_CLASSIFICATION_PROMPT = `Job email classifier. Output ONLY JSON: {"is_job_related":boolean}

Job-related emails:
- Application confirmations/receipts
- Interview scheduling
- Job offers/rejections  
- ATS notifications
- Recruiting outreach
- Application status updates

Not job-related:
- Newsletters/marketing
- Social media notifications
- Personal emails
- General business correspondence

Examples:
"Application received" → {"is_job_related":true}
"Interview invitation" → {"is_job_related":true}
"Job offer" → {"is_job_related":true}
"We regret to inform" → {"is_job_related":true}
"Weekly newsletter" → {"is_job_related":false}
"LinkedIn notification" → {"is_job_related":false}

Output ONLY the JSON.`;

// Stage 2: Detailed parsing prompt (optimized for accuracy)
const STAGE2_PARSING_PROMPT = `Expert job email parser. Extract company, position, and status from job-related emails.

Output JSON schema:
{
  "company": string | null,
  "position": string | null,
  "status": "Applied" | "Interview" | "Declined" | "Offer" | null
}

**Company Extraction Rules:**
- Extract official company name from email body/subject/from address
- Handle ATS patterns:
  * @myworkday.com → look for "at [Company]" or company mention in body
  * @greenhouse.io, @lever.co, @bamboohr.com → extract from body content
  * @smartrecruiters.com, @icims.com → check subject/body for company name
  * @brassring.com, @taleo.net → look for company in email signature/body
- Clean names: "Google Inc." → "Google", "Acme Corp" → "Acme", "Netflix, Inc." → "Netflix"
- Extract from sender domain: careers@salesforce.com → "Salesforce", noreply@kiwico.com → "KiwiCo"
- Return null if truly unclear

**Position Extraction Rules (Check Subject First, Then Body):**
- **Subject line patterns**: "Jr. Analyst, People Data (Animation)" → "Jr. Analyst, People Data (Animation)"
- **Clean job titles**: Remove codes ("R123 Data Analyst" → "Data Analyst")
- **Remove internal refs**: "SWE-2024-Q1" → "Software Engineer", "REQ-12345 Marketing Data Analyst" → "Marketing Data Analyst"
- **Application patterns with job codes**: 
  * "application for the R157623 BDR Insights Analyst role" → "BDR Insights Analyst"
  * "application for the REQ123 Marketing Manager position" → "Marketing Manager"
  * "applied to the C2024-001 Senior Developer role" → "Senior Developer"
- **Job code patterns to remove**: R######, REQ######, C####-###, [LETTER][NUMBERS], [LETTERS]-[NUMBERS]
- **Preserve qualifiers**: "Jr.", "Sr.", "Senior", "Principal", "Lead" 
- **Handle punctuation**: "Analyst / Sr. Analyst, Global GTM Strategy" → "Analyst / Sr. Analyst, Global GTM Strategy"
- **Extract from subject when body is vague**: Look for role in "Application for [ROLE]", "Thank you for applying for [ROLE]"
- **Common mappings**: "SWE" → "Software Engineer", "PM" → "Product Manager"
- Return null if position truly not mentioned

**Status Detection (CRITICAL: Rejection signals override everything):**
- **Declined**: "regret", "unfortunately", "not selected", "not moving forward", "decided not to proceed", "other candidates", "pursue other candidates", "chosen other candidates", "selected another candidate", "will not proceed", "will not be moving forward", "not be proceeding"
- **Offer**: "offer", "job offer", "compensation", "package", "congratulations", "pleased to offer", "extending an offer"
- **Interview**: "interview", "schedule", "phone screen", "technical screen", "availability", "next step", "assessment", "would like to schedule"
- **Applied**: "application received", "thank you for applying", "submitted", "under review", "application for", "have officially applied", "will review your application"

**Critical Parsing Rules:**
1. ALWAYS check subject line for position if body is generic
2. Rejection language ALWAYS = "Declined" status regardless of other content
3. If both application confirmation AND rejection appear, use "Declined"
4. Extract exact position from subject/body without over-cleaning
5. Use null for truly ambiguous cases

**Examples from real failing cases:**

Subject: "Thank you for your interest in the Jr. Analyst, People Data (Animation) role here at Netflix"
Body: "Regrettably, we have decided to move forward with other candidates"
→ {"company":"Netflix","position":"Jr. Analyst, People Data (Animation)","status":"Declined"}

Subject: "Thank you for applying for Marketing Data Analyst job with TEKsystems"  
Body: "Thank you for applying for Marketing Data Analyst job with TEKsystems. We're thrilled you'd like to join us. Our recruiters will review your skills"
→ {"company":"TEKsystems","position":"Marketing Data Analyst","status":"Applied"}

Subject: "You have officially applied for the Analyst / Sr. Analyst, Global GTM Strategy opening at Salesforce"
Body: "A member of our recruiting team will review your application"
→ {"company":"Salesforce","position":"Analyst / Sr. Analyst, Global GTM Strategy","status":"Applied"}

Subject: "Your application to Karbon"
Body: "Thank you for your interest in working with us. We've received your application and our team will review"
→ {"company":"Karbon","position":null,"status":"Applied"}

Subject: "Adobe Application Received"
Body: "We have received your application for a position at Adobe. Our recruiting team will review your qualifications"
→ {"company":"Adobe","position":null,"status":"Applied"}

Subject: "Your application for Marketing Analyst at Marsh"
Body: "Thank you for applying to Marketing Analyst position. We will review your application"
→ {"company":"Marsh","position":"Marketing Analyst","status":"Applied"}

Subject: "Adobe Application Confirmation"
Body: "We wanted to let you know that we received your application for the R157623 BDR Insights Analyst role"
→ {"company":"Adobe","position":"BDR Insights Analyst","status":"Applied"}

NEVER use "unknown" or "rejected" - use null or "Declined". Output ONLY JSON.`;

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
  if (stage1Session && loadedModelPath === modelPath) return stage1Session;

  const model = await ensureModel(modelPath);
  const module = await loadLlamaModule();
  const { LlamaContext, LlamaChatSession } = module;
  
  stage1Context = await model.createContext({ 
    contextSize: 1024, // Smaller context for speed
    batchSize: 256 
  });
  const sequence = stage1Context.getSequence();
  stage1Session = new LlamaChatSession({ 
    contextSequence: sequence, 
    systemPrompt: STAGE1_CLASSIFICATION_PROMPT 
  });
  return stage1Session;
}

// Stage 2: Detailed parsing session (full context, optimized for accuracy)
async function ensureStage2Session(modelPath: string) {
  if (stage2Session && loadedModelPath === modelPath) return stage2Session;

  const model = await ensureModel(modelPath);
  const module = await loadLlamaModule();
  const { LlamaContext, LlamaChatSession } = module;
  
  stage2Context = await model.createContext({ 
    contextSize: LLM_CONTEXT, // Full context for accuracy
    batchSize: 512 
  });
  const sequence = stage2Context.getSequence();
  stage2Session = new LlamaChatSession({ 
    contextSequence: sequence, 
    systemPrompt: STAGE2_PARSING_PROMPT 
  });
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

  // Minimal content for speed - prioritize subject and first part of body
  const maxContentLength = 800; // Much smaller for classification
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

  // Full content processing for accuracy
  const maxContentLength = 3000; // Larger for detailed parsing
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

  // Smart content truncation - prioritize important parts
  const maxContentLength = 2500; // Increased limit since we're doing everything in one step
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