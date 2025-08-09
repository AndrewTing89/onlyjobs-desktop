/**
 * Local LLM email classifier provider with post-processing normalization
 * Uses parseEmailWithLLM with graceful fallback to keyword provider
 */

const keywordProvider = require('./keywordProvider');

/**
 * Parse email content using local LLM with normalization post-processing
 * Falls back to keyword provider if LLM fails
 * @param {import('../index').ParseInput} input - Email content with fromAddress
 * @returns {Promise<import('../index').ParseResult>} Classification result
 */
async function parse(input) {
  try {
    // Dynamic import to avoid bundling in renderer/web builds
    const { parseEmailWithLLM } = await import('../../llm/llmEngine');
    const { normalizeResult } = await import('../normalize');
    
    console.log('🧠 Using LLM classifier with normalization...');
    
    // Get raw LLM result
    const llmResult = await parseEmailWithLLM({
      subject: input.subject,
      plaintext: input.plaintext
    });
    
    // Apply normalization post-processing
    const normalizeInput = {
      subject: input.subject,
      plaintext: input.plaintext,
      fromAddress: input.fromAddress || input.from || ''
    };
    
    const normalizedResult = normalizeResult(normalizeInput, llmResult);
    
    if (normalizedResult.notes && normalizedResult.notes.length > 0) {
      console.log('🔧 Applied normalization:', normalizedResult.notes.join(', '));
    }
    
    return normalizedResult;
    
  } catch (error) {
    console.warn('[llm] Parse failed; falling back to keyword provider:', (error && error.message) || error);
    
    // Apply normalization to keyword result too for consistency
    try {
      const keywordResult = await keywordProvider.parse(input);
      const { normalizeResult } = await import('../normalize');
      
      const normalizeInput = {
        subject: input.subject,
        plaintext: input.plaintext,
        fromAddress: input.fromAddress || input.from || ''
      };
      
      return normalizeResult(normalizeInput, keywordResult);
    } catch (normError) {
      console.warn('[llm] Normalization also failed, using raw keyword result');
      return keywordProvider.parse(input);
    }
  }
}

module.exports = { parse };