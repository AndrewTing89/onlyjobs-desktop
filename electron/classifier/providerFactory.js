/**
 * Two-stage LLM classifier provider factory
 * Stage 1: Fast job classification (<1.8s)
 * Stage 2: Detailed parsing (accuracy optimized)
 * Maintains backward compatibility with existing interfaces
 */

const { parseEmailWithLLM, parseEmailWithTwoStage, classifyEmail, parseJobEmail } = require('../llm/llmEngine');

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
 * Two-stage LLM provider: Fast classification + detailed parsing
 * @param {EmailInput} input 
 * @returns {Promise<ClassificationResult>}
 */
async function classifyWithTwoStageLLM(input) {
  try {
    console.log('🚀 Using two-stage LLM: fast classification + detailed parsing');
    
    const result = await parseEmailWithTwoStage({
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
      confidence: result.is_job_related ? 0.95 : 0.05, // Two-stage gives higher confidence
      decisionPath: 'two_stage_llm',
      notes: ['stage1_classification', 'stage2_parsing']
    };
    
  } catch (error) {
    console.error('[Two-stage LLM] Classification failed:', error.message);
    
    // Fallback to unified LLM if two-stage fails
    try {
      console.log('🔄 Falling back to unified LLM processing');
      
      const fallbackResult = await parseEmailWithLLM({
        subject: input.subject || '',
        plaintext: input.plaintext || '',
        from: input.fromAddress || input.from || '',
        headers: input.headers || {}
      });
      
      return {
        is_job_related: fallbackResult.is_job_related,
        company: fallbackResult.company,
        position: fallbackResult.position,
        status: fallbackResult.status,
        confidence: fallbackResult.is_job_related ? 0.8 : 0.2, // Lower confidence for fallback
        decisionPath: 'unified_llm_fallback',
        notes: ['two_stage_failed', 'unified_fallback']
      };
    } catch (fallbackError) {
      console.error('[Fallback LLM] Also failed:', fallbackError.message);
      
      // Final fallback - conservative empty result
      return {
        is_job_related: false,
        company: null,
        position: null,
        status: null,
        confidence: 0.0,
        decisionPath: 'complete_failure_fallback',
        notes: ['two_stage_failed', 'unified_failed', 'empty_baseline']
      };
    }
  }
}

/**
 * Legacy unified LLM provider for backward compatibility
 * @param {EmailInput} input 
 * @returns {Promise<ClassificationResult>}
 */
async function classifyWithUnifiedLLM(input) {
  try {
    console.log('🧠 Using unified LLM classifier (backward compatibility mode)');
    
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
      confidence: result.is_job_related ? 0.9 : 0.1, // Standard confidence
      decisionPath: 'unified_llm',
      notes: ['unified_llm_processing']
    };
    
  } catch (error) {
    console.error('[Unified LLM] Classification failed:', error.message);
    
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
 * Get the classifier provider - defaults to two-stage LLM
 * @param {string} [mode='two-stage'] - Provider mode: 'two-stage', 'unified', or 'auto'
 * @returns {Function} The LLM provider
 */
function getProvider(mode = 'auto') {
  switch (mode) {
    case 'two-stage':
      console.log('🚀 Using two-stage LLM classifier (fast + accurate)');
      return classifyWithTwoStageLLM;
    
    case 'unified':
      console.log('🧠 Using unified LLM classifier (backward compatibility)');
      return classifyWithUnifiedLLM;
    
    default:
      console.log('🧠 Using LLM classifier only (optimized for small models)');
      return classifyWithUnifiedLLM;
  }
}

/**
 * Legacy getClassifierProvider for backwards compatibility
 * @param {string} [mode='auto'] - Provider mode
 * @returns {{parse: Function}} Provider with parse method
 */
function getClassifierProvider(mode = 'auto') {
  const provider = getProvider(mode);
  return {
    parse: provider
  };
}

module.exports = {
  getProvider,
  getClassifierProvider,
  classifyWithTwoStageLLM,
  classifyWithUnifiedLLM,
  // Legacy exports for backward compatibility
  classifyWithCleanLLM: classifyWithTwoStageLLM,
  // Direct access to LLM functions
  parseEmailWithLLM,
  parseEmailWithTwoStage,
  classifyEmail,
  parseJobEmail
};