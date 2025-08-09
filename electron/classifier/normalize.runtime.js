/**
 * Runtime-friendly JS entry point for normalization
 * Re-exports compiled normalization functions for use in Node.js scripts
 */

// Import the compiled CommonJS normalize module
const { normalizeResult } = require('./normalize.js');

/**
 * Normalize email classification using the post-processing layer
 * @param {Object} emailData - Email metadata
 * @param {string|null} emailData.subject - Email subject
 * @param {string|null} emailData.plaintext - Email body content  
 * @param {string|null} emailData.from_address - From address
 * @param {Object} currentResult - Current classification result
 * @param {boolean} currentResult.is_job_related - Whether email is job-related
 * @param {string|null} currentResult.company - Company name
 * @param {string|null} currentResult.position - Position title
 * @param {string} currentResult.status - Application status
 * @param {number} currentResult.confidence - Confidence score
 * @returns {Object} Normalized result with notes and decision path suffix
 */
function normalizeEmailClassification(emailData, currentResult) {
  // Prepare input for normalization
  const normalizeInput = {
    subject: emailData.subject || '',
    plaintext: emailData.plaintext || '',
    fromAddress: emailData.from_address || ''
  };
  
  // Prepare mock LLM result from current data
  const mockLlmResult = {
    is_job_related: Boolean(currentResult.is_job_related),
    company: currentResult.company,
    position: currentResult.position,
    status: currentResult.status,
    confidence: currentResult.confidence || 0.5,
    decisionPath: 'existing_data'
  };
  
  try {
    // Apply normalization
    const normalized = normalizeResult(normalizeInput, mockLlmResult);
    
    // Extract decision path suffix (everything after the original path)
    let decisionPathSuffix = '';
    if (normalized.decisionPath && normalized.decisionPath !== mockLlmResult.decisionPath) {
      decisionPathSuffix = normalized.decisionPath.replace(mockLlmResult.decisionPath, '');
    }
    
    return {
      normalized: {
        is_job_related: normalized.is_job_related,
        company: normalized.company,
        position: normalized.position,
        status: normalized.status,
        confidence: normalized.confidence
      },
      notes: normalized.notes || [],
      decisionPathSuffix: decisionPathSuffix || undefined
    };
    
  } catch (error) {
    console.warn('Normalization failed:', error.message);
    return {
      normalized: currentResult,
      notes: ['normalization_error'],
      decisionPathSuffix: '_normalization_failed'
    };
  }
}

module.exports = {
  normalizeEmailClassification
};