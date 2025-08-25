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
      plaintext: input.plaintext || '',
      from: input.fromAddress || input.from || '',
      headers: input.headers || {}
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
    
    // Enhanced fallback with rule-based patterns
    const jobRelatedPatterns = [
      // Workday and ATS systems
      /@myworkday\.com/i,
      /@otp\.workday\.com/i,
      /your\s+one-time\s+passcode/i,
      /verification\s+code.*workday/i,
      
      // Coding platforms
      /@hackerrank\.com/i,
      /@codility\.com/i,
      /coding\s+(challenge|assessment|test)/i,
      /technical\s+(assessment|interview|challenge)/i,
      
      // Other ATS systems
      /@greenhouse\.io/i,
      /@lever\.co/i,
      /@bamboohr\.com/i,
      /@smartrecruiters\.com/i,
      /@icims\.com/i,
      /@taleo\.net/i,
      /@successfactors\.com/i,
      
      // Job-related keywords
      /application\s+(received|submitted|status)/i,
      /thank\s+you\s+for\s+(applying|your\s+application)/i,
      /interview\s+(invitation|request|scheduled)/i,
      /job\s+opportunity/i,
      /position\s+at/i,
      /we\s+regret\s+to\s+inform/i,
      /pleased\s+to\s+offer/i
    ];
    
    const emailText = `${input.fromAddress || ''} ${input.subject || ''} ${input.plaintext || ''}`;
    const isJobRelated = jobRelatedPatterns.some(pattern => pattern.test(emailText));
    
    if (isJobRelated) {
      console.log('[Fallback] Detected job-related email via pattern matching');
      return {
        is_job_related: true,
        company: null,
        position: null,
        status: null,
        confidence: 0.7,
        decisionPath: 'rule_based_fallback',
        notes: ['llm_failed', 'pattern_match_fallback']
      };
    }
    
    // Conservative empty result if no patterns match
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