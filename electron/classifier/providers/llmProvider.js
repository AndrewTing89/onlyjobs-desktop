/**
 * Local LLM email classifier provider
 * Uses parseEmailWithLLM with graceful fallback to keyword provider
 */

const keywordProvider = require('./keywordProvider');

/**
 * Parse email content using local LLM
 * Falls back to keyword provider if LLM fails
 * @param {import('../index').ParseInput} input - Email content to classify
 * @returns {Promise<import('../index').ParseResult>} Classification result
 */
async function parse(input) {
  try {
    // Dynamic import to avoid bundling in renderer/web builds
    const { parseEmailWithLLM } = await import('../../llm/llmEngine');
    console.log('🧠 Using LLM classifier...');
    return await parseEmailWithLLM(input);
  } catch (error) {
    console.warn('[llm] Parse failed; falling back to keyword provider:', (error && error.message) || error);
    return keywordProvider.parse(input);
  }
}

module.exports = { parse };