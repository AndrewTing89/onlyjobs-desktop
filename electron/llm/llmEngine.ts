import crypto from "crypto";
import { DEFAULT_MODEL_PATH, LLM_TEMPERATURE, LLM_MAX_TOKENS, LLM_CONTEXT, GPU_LAYERS } from "./config";
import { getStatusHint } from "./rules";

// We import lazily since node-llama-cpp is heavy
let llamaModule: any | null = null;
let loadedSession: any | null = null; // LlamaChatSession
let loadedContext: any | null = null; // LlamaContext
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

// Mistral-7B-Instruct prompt with few-shot learning
const UNIFIED_SYSTEM_PROMPT = `[INST] You are a job application email classifier. Analyze emails and return ONLY a JSON object.

Examples of correct classification:

Email: "From: noreply@myworkday.com
Subject: Your one-time passcode
Your one-time passcode: 123456"
Output: {"is_job_related":true,"company":null,"position":null,"status":null}

Email: "From: careers@acme.com
Subject: Application Received - Senior Data Analyst
Thank you for applying to the Senior Data Analyst position at Acme Corp."
Output: {"is_job_related":true,"company":"Acme","position":"Senior Data Analyst","status":"Applied"}

Email: "From: noreply@myworkday.com
Subject: Application Update
Your application for Software Engineer II at TechCorp has been received."
Output: {"is_job_related":true,"company":"TechCorp","position":"Software Engineer II","status":"Applied"}

Email: "From: hr@initech.com
Subject: Your Application Status
We regret to inform you that we will not be moving forward with your candidacy."
Output: {"is_job_related":true,"company":"Initech","position":null,"status":"Declined"}

Email: "From: talent@nestlé.com
Subject: Data Scientist Application Update
Thank you for applying to the Data Scientist position. We have decided to pursue other applicants."
Output: {"is_job_related":true,"company":"Nestlé","position":"Data Scientist","status":"Declined"}

Classification rules:
- Job-related: Applications, interviews, offers, rejections, ATS emails (Workday OTP, HackerRank, Codility)
- Not job-related: Newsletters, marketing, social media

Status priority (rejection overrides application):
- Declined: "regret", "unfortunately", "not selected", "not moving forward", "pursue other"
- Offer: "offer", "compensation", "pleased to offer"
- Interview: "interview", "schedule", "assessment", "coding challenge"
- Applied: "application received", "thank you for applying", "under review"

Company extraction:
- From ATS domains (@myworkday.com, @greenhouse.io) extract from body "at [Company]"
- Clean names: "Google Inc." → "Google"
- Return null if unknown

Position extraction:
- Clean codes: "R123 Data Analyst" → "Data Analyst"
- Standardize: "SWE" → "Software Engineer"
- Return null if unknown

Analyze this email and output JSON:
[/INST]`;

const cache = new Map<string, ParseResult>();

function makeCacheKey(subject: string, plaintext: string): string {
  const canonical = subject + "\n" + plaintext.slice(0, 1000);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

async function ensureUnifiedSession(modelPath: string) {
  if (loadedSession && loadedModelPath === modelPath) return loadedSession;

  const module = await loadLlamaModule();
  const { getLlama, LlamaModel, LlamaContext, LlamaChatSession } = module;
  const llama = await getLlama();
  loadedModel = await llama.loadModel({ modelPath });
  loadedContext = await loadedModel.createContext({ 
    contextSize: LLM_CONTEXT, 
    batchSize: 512 
  });
  const sequence = loadedContext.getSequence();
  loadedSession = new LlamaChatSession({ 
    contextSequence: sequence, 
    systemPrompt: UNIFIED_SYSTEM_PROMPT 
  });
  loadedModelPath = modelPath;
  return loadedSession;
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

export async function parseEmailWithLLM(input: {
  subject: string;
  plaintext: string;
  from?: string;  // Add optional from header for better context
  headers?: Record<string, string>; // Add optional full headers
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ParseResult> {
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
  const cached = cache.get(key);
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
      schema,
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

  cache.set(key, parsed);
  return parsed;
}