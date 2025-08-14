// electron/llm/provider.js
// adapter so classifier/index.js can resolve a concrete provider
const { parseEmailWithLLM, parseEmailWithTwoStage } = require('./llmEngine'); // your existing engine entry

function createLLMClassifier() {
  return {
    async parse(input) {
      // Use two-stage parsing for better accuracy, especially with job board emails
      // Map fields to match the expected structure for Indeed email detection
      return parseEmailWithTwoStage({
        subject: input.subject || '',
        plaintext: input.plaintext || '',
        from: input.fromAddress || input.from || '',  // Map fromAddress to from for Indeed detection
        headers: input.headers || {}
      });
    },
  };
}

module.exports = { createLLMClassifier };