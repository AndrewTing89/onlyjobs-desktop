// electron/llm/provider.js
// adapter so classifier/index.js can resolve a concrete provider
const { parseEmailWithLLM } = require('./llmEngine'); // your existing engine entry

function createLLMClassifier() {
  return {
    async parse(input) {
      return parseEmailWithLLM(input); // expects { subject, plaintext }
    },
  };
}

module.exports = { createLLMClassifier };