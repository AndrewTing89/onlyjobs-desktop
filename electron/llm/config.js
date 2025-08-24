"use strict";

const path = require("path");

// Model configuration
exports.DEFAULT_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH || path.resolve(process.cwd(), "models", "model.gguf");
exports.ONLYJOBS_MODEL_PATH = exports.DEFAULT_MODEL_PATH;
exports.DEFAULT_DOWNLOAD_URL = process.env.ONLYJOBS_DOWNLOAD_URL || "https://huggingface.co/hugging-quants/Llama-3.2-3B-Instruct-Q8_0-GGUF/resolve/main/llama-3.2-3b-instruct-q8_0.gguf";
exports.LLM_TEMPERATURE = Number(process.env.ONLYJOBS_TEMPERATURE || 0.0);
exports.LLM_MAX_TOKENS = Number(process.env.ONLYJOBS_MAX_TOKENS || 96);

// Ultra-fast Stage 1 configuration
exports.STAGE1_MAX_TOKENS = Number(process.env.ONLYJOBS_STAGE1_MAX_TOKENS || 48);
exports.STAGE1_TEMPERATURE = Number(process.env.ONLYJOBS_STAGE1_TEMP || 0.0);

// EMERGENCY: Ultra-minimal context sizes for 3B model
exports.LLM_CONTEXT = Number(process.env.ONLYJOBS_CTX || 512);
exports.STAGE1_CONTEXT = Number(process.env.ONLYJOBS_STAGE1_CTX || 512);
exports.STAGE2_CONTEXT = Number(process.env.ONLYJOBS_STAGE2_CTX || 1024);

// Optimized timeout configuration for better performance
exports.STAGE1_TIMEOUT = Number(process.env.ONLYJOBS_STAGE1_TIMEOUT || 3000);
exports.STAGE2_TIMEOUT = Number(process.env.ONLYJOBS_STAGE2_TIMEOUT || 6000);
exports.IPC_TIMEOUT = Number(process.env.ONLYJOBS_IPC_TIMEOUT || 8000);
exports.FALLBACK_THRESHOLD = Number(process.env.ONLYJOBS_FALLBACK_MS || 2500);

exports.GPU_LAYERS = Number(process.env.ONLYJOBS_N_GPU_LAYERS || 0);

// Versioning for tracking model decisions and prompts
exports.DECISION_VERSION = process.env.ONLYJOBS_DECISION_VERSION || "v1.0-prompt-2025-08-08";
exports.PROMPT_VERSION = process.env.ONLYJOBS_PROMPT_VERSION || "v1.0";
exports.MODEL_NAME = process.env.ONLYJOBS_MODEL_NAME || "Llama-3.2-3B Q8_0";
// Database configuration
function getElectronUserDataDir() {
    var productName = "OnlyJobs Desktop";
    var home = process.env.HOME || process.env.USERPROFILE || ".";
    if (process.platform === "darwin")
        return path.join(home, "Library", "Application Support", productName);
    if (process.platform === "win32")
        return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), productName);
    return path.join(home, ".config", productName);
}
exports.getElectronUserDataDir = getElectronUserDataDir;
function getDbPath() {
    var override = process.env.ONLYJOBS_DB_PATH;
    if (override && override.trim().length > 0)
        return path.resolve(override);
    return path.join(getElectronUserDataDir(), "jobs.db");
}
exports.getDbPath = getDbPath;
