"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d, _e, _f, _g, _h;
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPath = exports.getElectronUserDataDir = exports.MODEL_NAME = exports.PROMPT_VERSION = exports.DECISION_VERSION = exports.GPU_LAYERS = exports.LLM_CONTEXT = exports.LLM_MAX_TOKENS = exports.LLM_TEMPERATURE = exports.DEFAULT_MODEL_PATH = void 0;
const path_1 = __importDefault(require("path"));
// Model configuration
exports.DEFAULT_MODEL_PATH = (_a = process.env.ONLYJOBS_MODEL_PATH) !== null && _a !== void 0 ? _a : path_1.default.resolve(process.cwd(), "models", "model.gguf");
exports.LLM_TEMPERATURE = Number((_b = process.env.ONLYJOBS_TEMPERATURE) !== null && _b !== void 0 ? _b : 0.1);
exports.LLM_MAX_TOKENS = Number((_c = process.env.ONLYJOBS_MAX_TOKENS) !== null && _c !== void 0 ? _c : 256);
exports.LLM_CONTEXT = Number((_d = process.env.ONLYJOBS_CTX) !== null && _d !== void 0 ? _d : 2048);
exports.GPU_LAYERS = Number((_e = process.env.ONLYJOBS_N_GPU_LAYERS) !== null && _e !== void 0 ? _e : 0);
// Versioning for tracking model decisions and prompts
exports.DECISION_VERSION = (_f = process.env.ONLYJOBS_DECISION_VERSION) !== null && _f !== void 0 ? _f : "v1.0-prompt-2025-08-08";
exports.PROMPT_VERSION = (_g = process.env.ONLYJOBS_PROMPT_VERSION) !== null && _g !== void 0 ? _g : "v1.0";
exports.MODEL_NAME = (_h = process.env.ONLYJOBS_MODEL_NAME) !== null && _h !== void 0 ? _h : "Llama-3.2-3B Q4_K_M";
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
