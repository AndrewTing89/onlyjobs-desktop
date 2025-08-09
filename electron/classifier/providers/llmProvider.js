/**
 * Local LLM email classifier provider (STUB)
 * Will be implemented in next step with node-llama-cpp
 */

const keywordProvider = require('./keywordProvider');

/**
 * Parse email content using local LLM
 * Currently stubbed - falls back to keyword provider
 * @param {import('../index').ParseInput} input - Email content to classify
 * @returns {Promise<import('../index').ParseResult>} Classification result
 */
async function parse(input) {
  console.log('LLM provider not yet implemented, falling back to keyword classifier');
  
  // TODO: In next step, add node-llama-cpp integration here
  // For now, gracefully fallback to keyword provider to maintain UX
  return keywordProvider.parse(input);
}

module.exports = { parse };