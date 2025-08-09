/**
 * Python ML-based email classifier provider
 * Uses existing mlHandler.classifyEmail() with graceful fallback
 */

const keywordProvider = require('./keywordProvider');

let mlHandler = null;
try {
  mlHandler = require('../../ml-handler');
} catch (error) {
  console.warn('Python ML handler not available, will use keyword fallback:', error.message);
}

/**
 * Parse email content using Python ML classifier
 * Falls back to keyword provider if Python/ML is not available
 * @param {import('../index').ParseInput} input - Email content to classify
 * @returns {Promise<import('../index').ParseResult>} Classification result
 */
async function parse(input) {
  if (!mlHandler) {
    console.log('Python provider unavailable, falling back to keyword classifier');
    return keywordProvider.parse(input);
  }
  
  try {
    // Convert input to the format expected by existing mlHandler
    const content = `${input.subject} ${input.plaintext}`;
    
    console.log('📧 Using Python ML classifier...');
    const result = await mlHandler.classifyEmail(content);
    
    // Ensure the result conforms to our ParseResult interface
    return {
      is_job_related: result.is_job_related || false,
      company: result.company || null,
      position: result.position || null,
      status: result.status || null,
      confidence: result.confidence || 0.5,
      // Preserve any additional fields from the ML handler
      ...result
    };
    
  } catch (error) {
    console.warn('Python ML classification failed, falling back to keyword classifier:', error.message);
    return keywordProvider.parse(input);
  }
}

module.exports = { parse };