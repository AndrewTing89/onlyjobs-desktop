"use strict";
/**
 * Local LLM configuration constants
 * Reads environment variables with safe defaults
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DOWNLOAD_URL = exports.ONLYJOBS_PREFILTER_REGEX = exports.ONLYJOBS_ENABLE_PREFILTER = exports.ONLYJOBS_CACHE_TTL_HOURS = exports.ONLYJOBS_INFER_MAX_CHARS = exports.ONLYJOBS_EARLY_STOP_JSON = exports.ONLYJOBS_INFER_TIMEOUT_MS = exports.ONLYJOBS_MODEL_NAME = exports.ONLYJOBS_N_GPU_LAYERS = exports.ONLYJOBS_CTX = exports.ONLYJOBS_MAX_TOKENS = exports.ONLYJOBS_TEMPERATURE = exports.ONLYJOBS_MODEL_PATH = void 0;
exports.ONLYJOBS_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH || './models/model.gguf';
exports.ONLYJOBS_TEMPERATURE = parseFloat(process.env.ONLYJOBS_TEMPERATURE || '0.1');
exports.ONLYJOBS_MAX_TOKENS = parseInt(process.env.ONLYJOBS_MAX_TOKENS || '96', 10);
exports.ONLYJOBS_CTX = parseInt(process.env.ONLYJOBS_CTX || '768', 10);
exports.ONLYJOBS_N_GPU_LAYERS = parseInt(process.env.ONLYJOBS_N_GPU_LAYERS || '22', 10);
exports.ONLYJOBS_MODEL_NAME = process.env.ONLYJOBS_MODEL_NAME || 'Llama-3.2-3B Q4_K_M';
// Performance and reliability settings
exports.ONLYJOBS_INFER_TIMEOUT_MS = parseInt(process.env.ONLYJOBS_INFER_TIMEOUT_MS || '15000', 10);
exports.ONLYJOBS_EARLY_STOP_JSON = process.env.ONLYJOBS_EARLY_STOP_JSON !== '0';
exports.ONLYJOBS_INFER_MAX_CHARS = parseInt(process.env.ONLYJOBS_INFER_MAX_CHARS || '5000', 10);
exports.ONLYJOBS_CACHE_TTL_HOURS = parseInt(process.env.ONLYJOBS_CACHE_TTL_HOURS || '168', 10); // 7 days
exports.ONLYJOBS_ENABLE_PREFILTER = process.env.ONLYJOBS_ENABLE_PREFILTER === '1';
exports.ONLYJOBS_PREFILTER_REGEX = process.env.ONLYJOBS_PREFILTER_REGEX ||
    '(application|applied|interview|assessment|recruit|recruiting|talent|offer|candidate|position|role|job|opening|hiring)';
exports.DEFAULT_DOWNLOAD_URL = process.env.ONLYJOBS_MODEL_URL ||
    'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true';
