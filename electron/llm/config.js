"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPath = exports.getElectronUserDataDir = exports.MODEL_NAME = exports.PROMPT_VERSION = exports.DECISION_VERSION = exports.GPU_LAYERS = exports.LLM_CONTEXT = exports.LLM_MAX_TOKENS = exports.LLM_TEMPERATURE = exports.DEFAULT_MODEL_PATH = void 0;
const path = require("path");
// Model configuration
exports.DEFAULT_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH ?? path.resolve(process.cwd(), "models", "model.gguf");
exports.LLM_TEMPERATURE = Number(process.env.ONLYJOBS_TEMPERATURE ?? 0.1);
exports.LLM_MAX_TOKENS = Number(process.env.ONLYJOBS_MAX_TOKENS ?? 256);
exports.LLM_CONTEXT = Number(process.env.ONLYJOBS_CTX ?? 2048);
exports.GPU_LAYERS = Number(process.env.ONLYJOBS_N_GPU_LAYERS ?? 0);
// Versioning for tracking model decisions and prompts
exports.DECISION_VERSION = process.env.ONLYJOBS_DECISION_VERSION ?? "v1.0-prompt-2025-08-08";
exports.PROMPT_VERSION = process.env.ONLYJOBS_PROMPT_VERSION ?? "v1.0";
exports.MODEL_NAME = process.env.ONLYJOBS_MODEL_NAME ?? "Llama-3.2-3B Q4_K_M";
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
