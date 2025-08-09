/**
 * Local LLM configuration constants
 * Reads environment variables with safe defaults
 */

export const ONLYJOBS_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH || './models/model.gguf';
export const ONLYJOBS_TEMPERATURE = parseFloat(process.env.ONLYJOBS_TEMPERATURE || '0.1');
export const ONLYJOBS_MAX_TOKENS = parseInt(process.env.ONLYJOBS_MAX_TOKENS || '128', 10);
export const ONLYJOBS_CTX = parseInt(process.env.ONLYJOBS_CTX || '1024', 10);
export const ONLYJOBS_N_GPU_LAYERS = parseInt(process.env.ONLYJOBS_N_GPU_LAYERS || '0', 10);
export const ONLYJOBS_MODEL_NAME = process.env.ONLYJOBS_MODEL_NAME || 'Llama-3.2-3B Q4_K_M';

// Performance and reliability settings
export const ONLYJOBS_INFER_TIMEOUT_MS = parseInt(process.env.ONLYJOBS_INFER_TIMEOUT_MS || '8000', 10);
export const ONLYJOBS_INFER_MAX_CHARS = parseInt(process.env.ONLYJOBS_INFER_MAX_CHARS || '5000', 10);
export const ONLYJOBS_CACHE_TTL_HOURS = parseInt(process.env.ONLYJOBS_CACHE_TTL_HOURS || '168', 10); // 7 days
export const ONLYJOBS_ENABLE_PREFILTER = process.env.ONLYJOBS_ENABLE_PREFILTER === '1';
export const ONLYJOBS_PREFILTER_REGEX = process.env.ONLYJOBS_PREFILTER_REGEX || 
  '(application|applied|interview|assessment|recruit|recruiting|talent|offer|candidate|position|role|job|opening|hiring)';

export const DEFAULT_DOWNLOAD_URL = process.env.ONLYJOBS_MODEL_URL || 
  'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true';