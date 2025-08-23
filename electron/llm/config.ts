import path from "path";

// Model configuration
export const DEFAULT_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH ?? path.resolve(process.cwd(), "models", "model.gguf");
export const ONLYJOBS_MODEL_PATH = DEFAULT_MODEL_PATH;
export const DEFAULT_DOWNLOAD_URL = process.env.ONLYJOBS_DOWNLOAD_URL ?? "https://huggingface.co/hugging-quants/Llama-3.2-3B-Instruct-Q8_0-GGUF/resolve/main/llama-3.2-3b-instruct-q8_0.gguf";
export const LLM_TEMPERATURE = Number(process.env.ONLYJOBS_TEMPERATURE ?? 0.0); // Lower for faster inference
export const LLM_MAX_TOKENS = Number(process.env.ONLYJOBS_MAX_TOKENS ?? 128); // Reduced for speed

// Ultra-fast Stage 1 configuration
export const STAGE1_MAX_TOKENS = Number(process.env.ONLYJOBS_STAGE1_MAX_TOKENS ?? 32); // Minimal for classification
export const STAGE1_TEMPERATURE = Number(process.env.ONLYJOBS_STAGE1_TEMP ?? 0.0); // No randomness for speed

// Stage-specific context sizes for optimal performance
export const LLM_CONTEXT = Number(process.env.ONLYJOBS_CTX ?? 1024); // Reduced from 2048
export const STAGE1_CONTEXT = Number(process.env.ONLYJOBS_STAGE1_CTX ?? 1024); // Increased for prompt compatibility
export const STAGE2_CONTEXT = Number(process.env.ONLYJOBS_STAGE2_CTX ?? 1024); // Reduced from 2048

// Aggressive timeout configuration for production reliability
export const STAGE1_TIMEOUT = Number(process.env.ONLYJOBS_STAGE1_TIMEOUT ?? 8000); // 8 second max for Stage 1
export const STAGE2_TIMEOUT = Number(process.env.ONLYJOBS_STAGE2_TIMEOUT ?? 12000); // 12 second max for Stage 2
export const IPC_TIMEOUT = Number(process.env.ONLYJOBS_IPC_TIMEOUT ?? 10000); // 10 second IPC wrapper
export const FALLBACK_THRESHOLD = Number(process.env.ONLYJOBS_FALLBACK_MS ?? 6000); // Fallback after 6s

export const GPU_LAYERS = Number(process.env.ONLYJOBS_N_GPU_LAYERS ?? 0);

// Versioning for tracking model decisions and prompts
export const DECISION_VERSION = process.env.ONLYJOBS_DECISION_VERSION ?? "v1.0-prompt-2025-08-08";
export const PROMPT_VERSION = process.env.ONLYJOBS_PROMPT_VERSION ?? "v1.0";
export const MODEL_NAME = process.env.ONLYJOBS_MODEL_NAME ?? "Llama-3.2-3B Q8_0";

// Database configuration
export function getElectronUserDataDir(): string {
  const productName = "OnlyJobs Desktop";
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", productName);
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), productName);
  return path.join(home, ".config", productName);
}

export function getDbPath(): string {
  const override = process.env.ONLYJOBS_DB_PATH;
  if (override && override.trim().length > 0) return path.resolve(override);
  return path.join(getElectronUserDataDir(), "jobs.db");
}