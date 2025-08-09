/**
 * Local LLM engine for email classification
 * Uses lazy-loaded node-llama-cpp with singleton pattern
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ONLYJOBS_MODEL_PATH,
  ONLYJOBS_TEMPERATURE,
  ONLYJOBS_MAX_TOKENS,
  ONLYJOBS_CTX,
  ONLYJOBS_N_GPU_LAYERS,
  ONLYJOBS_INFER_TIMEOUT_MS,
  ONLYJOBS_INFER_MAX_CHARS,
  ONLYJOBS_CACHE_TTL_HOURS,
  ONLYJOBS_ENABLE_PREFILTER,
  ONLYJOBS_PREFILTER_REGEX
} from './config';
import { getCachedResult, setCachedResult, cleanupExpiredCache } from './cache';
import { SYSTEM_PROMPT, userPrompt } from './prompts';
import { normalizeStatus, cleanText } from './normalize';

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
let concurrentRequests = 0;
const MAX_CONCURRENT_REQUESTS = 2;


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
        // Try simple repair: fix trailing commas, quotes
        const repaired = repairJson(jsonMatch[0]);
        if (repaired) {
          try {
            const parsed = JSON.parse(repaired);
            console.log('🔧 JSON repair successful');
            return validateAndFixParseResult(parsed);
          } catch (thirdError) {
            console.warn('JSON repair failed:', thirdError.message);
          }
        }
      }
    }
    
    // Last resort failed
    console.warn('Could not parse JSON response after repair attempts');
    console.warn('Raw response:', response);
    throw new Error(`Failed to parse LLM response as JSON: ${firstError.message}`);
  }
}

function repairJson(jsonText: string): string | null {
  try {
    // Common repairs: trailing commas, unquoted keys, single quotes
    let repaired = jsonText
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
      .replace(/'/g, '"'); // Convert single quotes to double quotes
    
    return repaired;
  } catch (error) {
    return null;
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

function applyPrefilter(subject: string, plaintext: string): boolean {
  if (!ONLYJOBS_ENABLE_PREFILTER) {
    return true; // Pass through if prefilter disabled
  }
  
  const combined = `${subject} ${plaintext}`.toLowerCase();
  const regex = new RegExp(ONLYJOBS_PREFILTER_REGEX, 'i');
  const matches = regex.test(combined);
  
  console.log(`🔍 Prefilter: ${matches ? 'PASS' : 'SKIP'} (regex: ${ONLYJOBS_PREFILTER_REGEX})`);
  return matches;
}

function truncateContent(plaintext: string): string {
  if (plaintext.length <= ONLYJOBS_INFER_MAX_CHARS) {
    return plaintext;
  }
  
  const keepEnd = 800;
  const keepStart = ONLYJOBS_INFER_MAX_CHARS - keepEnd - 10; // 10 for separator
  
  const start = plaintext.substring(0, keepStart);
  const end = plaintext.substring(plaintext.length - keepEnd);
  const truncated = `${start}\n...\n${end}`;
  
  console.log(`✂️ Truncated content: ${plaintext.length} -> ${truncated.length} chars`);
  return truncated;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

export async function parseEmailWithLLM(input: ParseInput): Promise<ParseResult> {
  const startTime = Date.now();
  let decisionPath = '';
  
  try {
    // Concurrency guard
    if (concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
      console.warn(`⚠️ Too many concurrent requests (${concurrentRequests}), falling back to keyword`);
      const keywordProvider = await import('../classifier/providers/keywordProvider');
      return keywordProvider.parse(input);
    }
    
    concurrentRequests++;
    
    try {
      // Check cache first
      const cached = getCachedResult(input.subject, input.plaintext);
      if (cached) {
        decisionPath = 'cache_hit';
        console.log(`⚡ ${decisionPath} (${Date.now() - startTime}ms)`);
        return cached;
      }
      
      // Apply prefilter
      if (!applyPrefilter(input.subject, input.plaintext)) {
        decisionPath = 'prefilter_skip';
        console.log(`⚡ ${decisionPath} (${Date.now() - startTime}ms)`);
        const keywordProvider = await import('../classifier/providers/keywordProvider');
        return keywordProvider.parse(input);
      }
      
      // Initialize LLM
      await initializeLLM();
      
      if (!loadedSession) {
        throw new Error('Chat session not available');
      }
      
      // Truncate content if needed
      const truncatedContent = truncateContent(input.plaintext);
      const userMessage = userPrompt(input.subject, truncatedContent);
      
      console.log('🧠 Querying LLM for email classification...');
      
      // Run inference with timeout
      const response = await withTimeout(
        loadedSession.prompt([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ], {
          temperature: ONLYJOBS_TEMPERATURE,
          maxTokens: ONLYJOBS_MAX_TOKENS,
        }),
        ONLYJOBS_INFER_TIMEOUT_MS
      );
      
      console.log('📝 LLM response:', response);
      
      const parsedResult = parseJsonResponse(response);
      
      // Apply normalization
      parsedResult.status = normalizeStatus(parsedResult.status);
      parsedResult.company = cleanText(parsedResult.company);
      parsedResult.position = cleanText(parsedResult.position);
      parsedResult.is_job_related = Boolean(parsedResult.is_job_related);
      parsedResult.confidence = typeof parsedResult.confidence === 'number' ? 
        Math.max(0, Math.min(1, parsedResult.confidence)) : 0.5;
      
      decisionPath = 'llm_success';
      
      // Cache the result
      setCachedResult(input.subject, input.plaintext, parsedResult);
      
      console.log(`✅ ${decisionPath} (${Date.now() - startTime}ms)`, parsedResult);
      
      // Periodic cache cleanup
      if (Math.random() < 0.1) { // 10% chance
        cleanupExpiredCache();
      }
      
      return parsedResult;
      
    } finally {
      concurrentRequests--;
    }
    
  } catch (error) {
    const errorTime = Date.now() - startTime;
    
    if (error.message.includes('timed out')) {
      decisionPath = 'timeout_fallback';
      console.warn(`⏱️ ${decisionPath} (${errorTime}ms):`, error.message);
    } else if (error.message.includes('parse')) {
      decisionPath = 'parse_fail_fallback';
      console.warn(`🔧 ${decisionPath} (${errorTime}ms):`, error.message);
    } else {
      decisionPath = 'llm_error_fallback';
      console.error(`❌ ${decisionPath} (${errorTime}ms):`, error);
    }
    
    // Fallback to keyword provider
    const keywordProvider = await import('../classifier/providers/keywordProvider');
    const result = await keywordProvider.parse(input);
    console.log(`🔄 Fallback result (${Date.now() - startTime}ms):`, result);
    return result;
  }
}