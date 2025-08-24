"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPath = exports.getElectronUserDataDir = exports.MODEL_NAME = exports.PROMPT_VERSION = exports.DECISION_VERSION = exports.GPU_LAYERS = exports.FALLBACK_THRESHOLD = exports.IPC_TIMEOUT = exports.STAGE2_TIMEOUT = exports.STAGE1_TIMEOUT = exports.STAGE2_CONTEXT = exports.STAGE1_CONTEXT = exports.LLM_CONTEXT = exports.STAGE1_TEMPERATURE = exports.STAGE1_MAX_TOKENS = exports.LLM_MAX_TOKENS = exports.LLM_TEMPERATURE = exports.DEFAULT_DOWNLOAD_URL = exports.ONLYJOBS_MODEL_PATH = exports.DEFAULT_MODEL_PATH = void 0;
const path_1 = __importDefault(require("path"));
// Model configuration
exports.DEFAULT_MODEL_PATH = (_a = process.env.ONLYJOBS_MODEL_PATH) !== null && _a !== void 0 ? _a : path_1.default.resolve(process.cwd(), "models", "model.gguf");
exports.ONLYJOBS_MODEL_PATH = exports.DEFAULT_MODEL_PATH;
exports.DEFAULT_DOWNLOAD_URL = (_b = process.env.ONLYJOBS_DOWNLOAD_URL) !== null && _b !== void 0 ? _b : "https://huggingface.co/hugging-quants/Llama-3.2-3B-Instruct-Q8_0-GGUF/resolve/main/llama-3.2-3b-instruct-q8_0.gguf";
exports.LLM_TEMPERATURE = Number((_c = process.env.ONLYJOBS_TEMPERATURE) !== null && _c !== void 0 ? _c : 0.0); // Lower for faster inference
exports.LLM_MAX_TOKENS = Number((_d = process.env.ONLYJOBS_MAX_TOKENS) !== null && _d !== void 0 ? _d : 96); // Optimized for speed and accuracy
// Ultra-fast Stage 1 configuration  
exports.STAGE1_MAX_TOKENS = Number((_e = process.env.ONLYJOBS_STAGE1_MAX_TOKENS) !== null && _e !== void 0 ? _e : 48); // Increased slightly for JSON consistency
exports.STAGE1_TEMPERATURE = Number((_f = process.env.ONLYJOBS_STAGE1_TEMP) !== null && _f !== void 0 ? _f : 0.0); // No randomness for speed
// Stage-specific context sizes for optimal performance
exports.LLM_CONTEXT = Number((_g = process.env.ONLYJOBS_CTX) !== null && _g !== void 0 ? _g : 2048); // Increased for prompt compatibility
exports.STAGE1_CONTEXT = Number((_h = process.env.ONLYJOBS_STAGE1_CTX) !== null && _h !== void 0 ? _h : 2048); // Increased for prompt compatibility
exports.STAGE2_CONTEXT = Number((_j = process.env.ONLYJOBS_STAGE2_CTX) !== null && _j !== void 0 ? _j : 2048); // Increased for prompt compatibility
// OPTIMIZED timeout configuration for faster performance and reliability
exports.STAGE1_TIMEOUT = Number((_k = process.env.ONLYJOBS_STAGE1_TIMEOUT) !== null && _k !== void 0 ? _k : 3000); // 3 second max for Stage 1 (faster classification)
exports.STAGE2_TIMEOUT = Number((_l = process.env.ONLYJOBS_STAGE2_TIMEOUT) !== null && _l !== void 0 ? _l : 6000); // 6 second max for Stage 2 (faster parsing)
exports.IPC_TIMEOUT = Number((_m = process.env.ONLYJOBS_IPC_TIMEOUT) !== null && _m !== void 0 ? _m : 8000); // 8 second IPC wrapper
exports.FALLBACK_THRESHOLD = Number((_o = process.env.ONLYJOBS_FALLBACK_MS) !== null && _o !== void 0 ? _o : 2500); // Fallback after 2.5s (quicker fallback)
exports.GPU_LAYERS = Number((_p = process.env.ONLYJOBS_N_GPU_LAYERS) !== null && _p !== void 0 ? _p : 0);
// Versioning for tracking model decisions and prompts
exports.DECISION_VERSION = (_q = process.env.ONLYJOBS_DECISION_VERSION) !== null && _q !== void 0 ? _q : "v1.0-prompt-2025-08-08";
exports.PROMPT_VERSION = (_r = process.env.ONLYJOBS_PROMPT_VERSION) !== null && _r !== void 0 ? _r : "v1.0";
exports.MODEL_NAME = (_s = process.env.ONLYJOBS_MODEL_NAME) !== null && _s !== void 0 ? _s : "Llama-3.2-3B Q8_0";
// Database configuration
function getElectronUserDataDir() {
    const productName = "OnlyJobs Desktop";
    const home = process.env.HOME || process.env.USERPROFILE || ".";
    if (process.platform === "darwin")
        return path_1.default.join(home, "Library", "Application Support", productName);
    if (process.platform === "win32")
        return path_1.default.join(process.env.APPDATA || path_1.default.join(home, "AppData", "Roaming"), productName);
    return path_1.default.join(home, ".config", productName);
}
exports.getElectronUserDataDir = getElectronUserDataDir;
function getDbPath() {
    const override = process.env.ONLYJOBS_DB_PATH;
    if (override && override.trim().length > 0)
        return path_1.default.resolve(override);
    return path_1.default.join(getElectronUserDataDir(), "jobs.db");
}
exports.getDbPath = getDbPath;
