/**
 * Local LLM configuration constants
 * Reads environment variables with safe defaults
 */

export const ONLYJOBS_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH || './models/model.gguf';
export const ONLYJOBS_TEMPERATURE = parseFloat(process.env.ONLYJOBS_TEMPERATURE || '0.1');
export const ONLYJOBS_MAX_TOKENS = parseInt(process.env.ONLYJOBS_MAX_TOKENS || '256', 10);
export const ONLYJOBS_CTX = parseInt(process.env.ONLYJOBS_CTX || '2048', 10);
export const ONLYJOBS_N_GPU_LAYERS = parseInt(process.env.ONLYJOBS_N_GPU_LAYERS || '0', 10);
export const ONLYJOBS_MODEL_NAME = process.env.ONLYJOBS_MODEL_NAME || 'Llama-3.2-3B Q4_K_M';

export const DEFAULT_DOWNLOAD_URL = process.env.ONLYJOBS_MODEL_URL || 
  'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true';