"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPath = exports.getElectronUserDataDir = exports.MODEL_NAME = exports.PROMPT_VERSION = exports.DECISION_VERSION = exports.GPU_LAYERS = exports.LLM_CONTEXT = exports.LLM_MAX_TOKENS = exports.LLM_TEMPERATURE = exports.DEFAULT_MODEL_PATH = void 0;
const path = require("path");
// Model configuration
// Determine if we're in a packaged app and get the correct path
let defaultPath;
// Check if we're in a packaged app by looking for app.asar in the path
const isPackaged = __dirname.includes('app.asar');
if (isPackaged && process.resourcesPath) {
    // We're in a packaged app - models are in Resources directory
    defaultPath = path.join(process.resourcesPath, "models", "model.gguf");
    console.log('LLM Config: Running in packaged app');
    console.log('LLM Config: Resources path:', process.resourcesPath);
}
else {
    // In development, use relative path from the config file location
    const configDir = __dirname; // electron/llm
    const electronDir = path.dirname(configDir); // electron
    const appRootPath = path.dirname(electronDir); // app root
    defaultPath = path.join(appRootPath, "models", "model.gguf");
    console.log('LLM Config: Running in development');
    console.log('LLM Config: App root path:', appRootPath);
}
console.log('LLM Config: Default model path resolved to:', defaultPath);
exports.DEFAULT_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH ?? defaultPath;
exports.LLM_TEMPERATURE = Number(process.env.ONLYJOBS_TEMPERATURE ?? 0.1);
exports.LLM_MAX_TOKENS = Number(process.env.ONLYJOBS_MAX_TOKENS ?? 256);
exports.LLM_CONTEXT = Number(process.env.ONLYJOBS_CTX ?? 2048);
exports.GPU_LAYERS = Number(process.env.ONLYJOBS_N_GPU_LAYERS ?? 0);

// Stage-specific optimizations for 3-stage classifier
exports.STAGE1_CONTEXT_SIZE = Number(process.env.ONLYJOBS_STAGE1_CTX ?? 512);  // Increased to handle custom prompts
exports.STAGE2_CONTEXT_SIZE = Number(process.env.ONLYJOBS_STAGE2_CTX ?? 1024);  // Moderate for extraction
exports.STAGE3_CONTEXT_SIZE = Number(process.env.ONLYJOBS_STAGE3_CTX ?? 512);   // For job matching comparison
exports.STAGE1_MAX_TOKENS = Number(process.env.ONLYJOBS_STAGE1_TOKENS ?? 15);   // Just for {"is_job": true/false}
exports.STAGE2_MAX_TOKENS = Number(process.env.ONLYJOBS_STAGE2_TOKENS ?? 100);  // For company/position/status JSON
exports.STAGE3_MAX_TOKENS = Number(process.env.ONLYJOBS_STAGE3_TOKENS ?? 15);   // Just for {"same_job": true/false}
// Versioning for tracking model decisions and prompts
exports.DECISION_VERSION = process.env.ONLYJOBS_DECISION_VERSION ?? "v1.0-prompt-2025-08-08";
exports.PROMPT_VERSION = process.env.ONLYJOBS_PROMPT_VERSION ?? "v1.0";
exports.MODEL_NAME = process.env.ONLYJOBS_MODEL_NAME ?? "Mistral-7B-Instruct Q4_K_M";
// Database configuration
function getElectronUserDataDir() {
    const productName = "OnlyJobs Desktop";
    const home = process.env.HOME || process.env.USERPROFILE || ".";
    if (process.platform === "darwin")
        return path.join(home, "Library", "Application Support", productName);
    if (process.platform === "win32")
        return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), productName);
    return path.join(home, ".config", productName);
}
exports.getElectronUserDataDir = getElectronUserDataDir;
function getDbPath() {
    const override = process.env.ONLYJOBS_DB_PATH;
    if (override && override.trim().length > 0)
        return path.resolve(override);
    return path.join(getElectronUserDataDir(), "jobs.db");
}
exports.getDbPath = getDbPath;
