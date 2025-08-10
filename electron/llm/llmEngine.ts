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

const SYSTEM_PROMPT = [
  "You are an email parser. Output ONLY JSON matching the schema, with no extra text.",
  "Decide if the email is job-related (job application, recruiting, ATS, interview, offer, rejection, etc.).",
  "If not job-related → is_job_related=false, and company=null, position=null, status=null.",
  "If job-related, extract:",
  "- company: prefer official name from signature/body; map sender domain if helpful.",
  "- position: the role title if present.",
  "- status: one of Applied | Interview | Declined | Offer; if uncertain use null.",
  "Use low temperature (0.1-0.2). No 'unknown' anywhere. Use null per the schema.",
  "",
  "Examples:",
  "Input\nSubject: Application received – Data Analyst\nBody: Thanks for applying to Acme. We received your application for Data Analyst.\nOutput",
  '{"is_job_related":true,"company":"Acme","position":"Data Analyst","status":"Applied"}',
  "",
  "Input\nSubject: Interview availability – Globex\nBody: We'd like to schedule a 30-min interview this week regarding your application at Globex.\nOutput",
  '{"is_job_related":true,"company":"Globex","position":null,"status":"Interview"}',
  "",
  "Input\nSubject: Your application at Initech\nBody: We regret to inform you we will not move forward with your candidacy at Initech.\nOutput",
  '{"is_job_related":true,"company":"Initech","position":null,"status":"Declined"}',
  "",
  "Input\nSubject: Offer – Backend Engineer\nBody: Congratulations! We're excited to extend you an offer for Backend Engineer at Umbrella Corp.\nOutput",
  '{"is_job_related":true,"company":"Umbrella Corp","position":"Backend Engineer","status":"Offer"}',
  "",
  "Input\nSubject: Career tips and market insights for August\nBody: Newsletter: industry news and general career advice.\nOutput",
  '{"is_job_related":false,"company":null,"position":null,"status":null}',
].join("\n");

const cache = new Map<string, ParseResult>();

function makeCacheKey(subject: string, plaintext: string): string {
  const canonical = subject + "\n" + plaintext.slice(0, 1000);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

async function ensureSession(modelPath: string) {
  if (loadedSession && loadedModelPath === modelPath) return loadedSession;

  const module = await loadLlamaModule();
  const { getLlama, LlamaModel, LlamaContext, LlamaChatSession } = module;
  const llama = await getLlama();
  loadedModel = await llama.loadModel({ modelPath });
  loadedContext = await loadedModel.createContext({ contextSize: LLM_CONTEXT, batchSize: 512 });
  const sequence = loadedContext.getSequence();
  loadedSession = new LlamaChatSession({ contextSequence: sequence, systemPrompt: SYSTEM_PROMPT });
  loadedModelPath = modelPath;
  return loadedSession;
}

export async function parseEmailWithLLM(input: {
  subject: string;
  plaintext: string;
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ParseResult> {
  const subject = input.subject ?? "";
  const plaintext = input.plaintext ?? "";
  const modelPath = input.modelPath ?? DEFAULT_MODEL_PATH;
  const temperature = input.temperature ?? LLM_TEMPERATURE;
  const maxTokens = input.maxTokens ?? LLM_MAX_TOKENS;

  const key = makeCacheKey(subject, plaintext);
  const cached = cache.get(key);
  if (cached) return cached;

  const session = await ensureSession(modelPath);

  const hint = getStatusHint(subject, plaintext);
  const userPrompt = [
    hint ? `${hint}` : null,
    `Input`,
    `Subject: ${subject}`,
    `Body: ${plaintext}`,
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

  // node-llama-cpp with responseFormat json_schema guarantees valid JSON matching schema
  // but we still defensively parse and coerce nulls instead of 'unknown'
  let parsed: ParseResult;
  try {
    parsed = JSON.parse(response) as ParseResult;
  } catch (err) {
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
  if (parsed.company && /^unknown$/i.test(parsed.company)) parsed.company = null;
  if (parsed.position && /^unknown$/i.test(parsed.position)) parsed.position = null;

  cache.set(key, parsed);
  return parsed;
}