export const DEFAULT_MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH ?? "./models/model.gguf";
export const LLM_TEMPERATURE = Number(process.env.ONLYJOBS_TEMPERATURE ?? 0.2);
export const LLM_MAX_TOKENS = Number(process.env.ONLYJOBS_MAX_TOKENS ?? 256);
export const LLM_CONTEXT = Number(process.env.ONLYJOBS_CTX ?? 2048);
export const GPU_LAYERS = Number(process.env.ONLYJOBS_N_GPU_LAYERS ?? 0);
