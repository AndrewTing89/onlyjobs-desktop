const keywordProvider = require('./providers/keywordProvider');
const pythonProvider = require('./providers/pythonProvider');
const llmProvider = require('./providers/llmProvider');

/**
 * @typedef {Object} ParseInput
 * @property {string} subject - Email subject line
 * @property {string} plaintext - Email plain text content
 */

/**
 * @typedef {Object} ParseResult
 * @property {boolean} is_job_related - Whether email is job-related
 * @property {string|null} company - Extracted company name
 * @property {string|null} position - Extracted position title
 * @property {"Applied"|"Interview"|"Declined"|"Offer"|null} status - Job application status
 * @property {number} [confidence] - Confidence score (0-1)
 */

/**
 * Get the active classifier provider based on environment configuration
 * @returns {{parse: (input: ParseInput) => Promise<ParseResult>}} The selected provider
 */
function getClassifierProvider() {
  const mode = process.env.CLASSIFIER_PROVIDER || 'keyword';
  
  switch (mode) {
    case 'python':
      return pythonProvider;
    case 'llm':
      return llmProvider; // Currently stubbed
    default:
      console.log(`Using keyword classifier provider (mode: ${mode})`);
      return keywordProvider;
  }
}

module.exports = {
  getClassifierProvider
};