/**
 * Clean LLM-only classifier provider factory
 * Uses the new, working LLM engine with JSON schema validation
 */

const { parseEmailWithLLM } = require('../llm/llmEngine');

/**
 * @typedef {Object} EmailInput
 * @property {string} subject - Email subject line
 * @property {string} plaintext - Email plain text content
 * @property {string} [fromAddress] - Email from address
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {boolean} is_job_related - Whether email is job-related
 * @property {string|null} company - Extracted company name
 * @property {string|null} position - Extracted position title
 * @property {"Applied"|"Interview"|"Declined"|"Offer"|null} status - Job application status
 * @property {number} [confidence] - Confidence score (0-1)
 * @property {string} [decisionPath] - Decision path for debugging
 * @property {string[]} [notes] - Processing notes
 */

/**
 * LLM provider with clean JSON schema-based parsing
 * @param {EmailInput} input 
 * @returns {Promise<ClassificationResult>}
 */
async function classifyWithCleanLLM(input) {
  try {
    console.log('🧠 Using clean LLM classifier with JSON schema validation');
    
    const result = await parseEmailWithLLM({
      subject: input.subject || '',
      plaintext: input.plaintext || ''
    });
    
    // Convert to expected format and add metadata
    return {
      is_job_related: result.is_job_related,
      company: result.company,
      position: result.position,
      status: result.status,
      confidence: result.is_job_related ? 0.9 : 0.1, // LLM gives high confidence
      decisionPath: 'llm_json_schema',
      notes: ['clean_llm_with_json_schema']
    };
    
  } catch (error) {
    console.error('[Clean LLM] Classification failed:', error.message);
    
    // Simple fallback - conservative empty result
    return {
      is_job_related: false,
      company: null,
      position: null,
      status: null,
      confidence: 0.0,
      decisionPath: 'llm_error_fallback',
      notes: ['llm_failed', 'empty_baseline']
    };
  }
}

/**
 * Get the classifier provider - clean LLM only
 * @returns {Function} The LLM provider
 */
function getProvider() {
  console.log('🚀 Using clean LLM classifier with JSON schema validation');
  return classifyWithCleanLLM;
}

/**
 * Legacy getClassifierProvider for backwards compatibility
 * @returns {{parse: Function}} Provider with parse method
 */
function getClassifierProvider() {
  const provider = getProvider();
  return {
    parse: provider
  };
}

module.exports = {
  getProvider,
  getClassifierProvider,
  classifyWithCleanLLM
};