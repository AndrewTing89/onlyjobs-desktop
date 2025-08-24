"use strict";
/**
 * Optimized compact prompts for local LLM email classification.
 * Reduced token usage while maintaining accuracy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.userPrompt = exports.SYSTEM_PROMPT = void 0;

// EMERGENCY: Ultra-minimal prompts for 3B model - maximum 20 words for Stage 1
exports.SYSTEM_PROMPT = `Is this email about a job application? Reply true/false only.`;

// EMERGENCY: Remove few-shots to save tokens for 3B model
const FEWSHOTS = ``;

function userPrompt(subject, plaintext) {
  // EMERGENCY: Ultra-minimal prompt for 3B model classification
  return `${subject} ${plaintext}

Is this about a job application response? true or false:`;
}
exports.userPrompt = userPrompt;