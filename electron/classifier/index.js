// electron/classifier/index.js
// LLM-only provider factory (no ML, no keyword provider)
const path = require('path');

function getLLMProvider() {
  // centralize the single LLM provider entry
  // adjust the path if your provider file lives elsewhere
  const provider = require('../llm/provider'); // CommonJS module expected
  if (provider?.createLLMClassifier) return provider.createLLMClassifier();
  if (provider?.getClassifier) return provider.getClassifier();
  if (typeof provider === 'function') return provider();
  throw new Error('LLM provider not found: ../llm/provider');
}

module.exports = {
  getClassifierProvider() {
    return getLLMProvider();
  },
};