import path from "path";

// Model configuration
// Determine if we're in a packaged app and get the correct path
let defaultPath: string;

// Check if we're in a packaged app by looking for app.asar in the path
const isPackaged = __dirname.includes('app.asar');

if (isPackaged && (process as any).resourcesPath) {
    // We're in a packaged app - models are in Resources directory
    defaultPath = path.join((process as any).resourcesPath, "models", "model.gguf");
    console.log('LLM Config: Running in packaged app');
    console.log('LLM Config: Resources path:', (process as any).resourcesPath);
} else {
    // In development, use relative path from the config file location
    const configDir = __dirname; // electron/llm
    const electronDir = path.dirname(configDir); // electron
    const appRootPath = path.dirname(electronDir); // app root
    defaultPath = path.join(appRootPath, "models", "model.gguf");
    console.log('LLM Config: Running in development');
    console.log('LLM Config: App root path:', appRootPath);
}

console.log('LLM Config: Default model path resolved to:', defaultPath);
export const DEFAULT_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH ?? defaultPath;
export const LLM_TEMPERATURE = Number(process.env.ONLYJOBS_TEMPERATURE ?? 0.1);
export const LLM_MAX_TOKENS = Number(process.env.ONLYJOBS_MAX_TOKENS ?? 256);
export const LLM_CONTEXT = Number(process.env.ONLYJOBS_CTX ?? 2048);
export const GPU_LAYERS = Number(process.env.ONLYJOBS_N_GPU_LAYERS ?? 0);

// Versioning for tracking model decisions and prompts
export const DECISION_VERSION = process.env.ONLYJOBS_DECISION_VERSION ?? "v1.0-prompt-2025-08-08";
export const PROMPT_VERSION = process.env.ONLYJOBS_PROMPT_VERSION ?? "v1.0";
export const MODEL_NAME = process.env.ONLYJOBS_MODEL_NAME ?? "Mistral-7B-Instruct Q4_K_M";

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