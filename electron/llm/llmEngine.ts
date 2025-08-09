/**
 * Local LLM engine for email classification
 * Uses lazy-loaded node-llama-cpp with singleton pattern
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ONLYJOBS_MODEL_PATH,
  ONLYJOBS_TEMPERATURE,
  ONLYJOBS_MAX_TOKENS,
  ONLYJOBS_CTX,
  ONLYJOBS_N_GPU_LAYERS
} from './config';

export type ParseInput = {
  subject: string;
  plaintext: string;
};

export type ParseResult = {
  is_job_related: boolean;
  company: string | null;
  position: string | null;
  status: "Applied" | "Interview" | "Declined" | "Offer" | null;
  confidence?: number;
};

// Module-level singletons (lazy loaded)
let llamaModule: any | null = null;
let llamaInstance: any | null = null;
let loadedModel: any | null = null;
let loadedContext: any | null = null;
let loadedSession: any | null = null;
let loadedModelPath: string | null = null;

const SYSTEM_PROMPT = `You are an email classifier for job applications. Output ONLY strict JSON matching this exact schema:
{"is_job_related": boolean, "company": string|null, "position": string|null, "status": "Applied"|"Interview"|"Declined"|"Offer"|null, "confidence": number}

Examples:
Input: "Thank you for applying to Data Analyst position at Acme Corp. We received your application."
Output: {"is_job_related": true, "company": "Acme Corp", "position": "Data Analyst", "status": "Applied", "confidence": 0.95}

Input: "Your subscription renewal is due next month."
Output: {"is_job_related": false, "company": null, "position": null, "status": null, "confidence": 0.9}`;

async function initializeLLM(): Promise<void> {
  const currentModelPath = path.resolve(ONLYJOBS_MODEL_PATH);
  
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
    // Lazy import node-llama-cpp (ONLY here)
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
        gpuLayers: ONLYJOBS_N_GPU_LAYERS
      });
      loadedModelPath = currentModelPath;
    }
    
    // Create context if not already created
    if (!loadedContext) {
      console.log(`🧮 Creating context (ctx=${ONLYJOBS_CTX})...`);
      loadedContext = await loadedModel.createContext({
        contextSize: ONLYJOBS_CTX
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
    
  } catch (error) {
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

function parseJsonResponse(response: string): ParseResult {
  let jsonText = response.trim();
  
  // Try to parse directly first
  try {
    const parsed = JSON.parse(jsonText);
    return validateAndFixParseResult(parsed);
  } catch (firstError) {
    // Try to extract JSON from markdown or other wrapper
    const jsonMatch = jsonText.match(/\{[^}]*\}/s);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return validateAndFixParseResult(parsed);
      } catch (secondError) {
        console.warn('Failed to parse extracted JSON:', secondError);
      }
    }
    
    // Last resort: try to extract key-value pairs manually
    console.warn('Could not parse JSON response, attempting manual extraction');
    console.warn('Raw response:', response);
    throw new Error(`Failed to parse LLM response as JSON: ${firstError.message}`);
  }
}

function validateAndFixParseResult(obj: any): ParseResult {
  // Ensure required fields exist with correct types
  const result: ParseResult = {
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

export async function parseEmailWithLLM(input: ParseInput): Promise<ParseResult> {
  try {
    await initializeLLM();
    
    if (!loadedSession) {
      throw new Error('Chat session not available');
    }
    
    const emailContent = `Subject: ${input.subject}\n\nContent: ${input.plaintext}`;
    
    console.log('🧠 Querying LLM for email classification...');
    const response = await loadedSession.prompt([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: emailContent }
    ], {
      temperature: ONLYJOBS_TEMPERATURE,
      maxTokens: ONLYJOBS_MAX_TOKENS,
    });
    
    console.log('📝 LLM response:', response);
    
    const parsedResult = parseJsonResponse(response);
    console.log('✅ Parsed result:', parsedResult);
    
    return parsedResult;
    
  } catch (error) {
    console.error('❌ LLM parsing failed:', error);
    throw error;
  }
}