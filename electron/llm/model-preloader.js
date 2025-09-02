/**
 * Model Preloader
 * Loads LLM models at app startup to avoid delays during first sync
 */

const path = require('path');
const os = require('os');

// Import the optimized two-stage classifier which handles model loading
const twoStage = require('./two-stage-classifier');

/**
 * Preload the default model in the background
 */
async function preloadDefaultModel() {
  try {
    // Silently start model preload
    
    // Default model configuration
    const modelId = 'llama-3-8b-instruct-q5_k_m';
    const modelsDir = path.join(os.homedir(), 'Library', 'Application Support', 'models');
    const modelPath = path.join(modelsDir, `${modelId}.gguf`);
    
    // Check if model file exists
    const fs = require('fs');
    if (!fs.existsSync(modelPath)) {
      // Model file not found - will be loaded on first use
      return;
    }
    
    // Preloading model
    const startTime = Date.now();
    
    // Warm up the model with a dummy classification
    // This loads the model and creates the initial context
    const dummyResult = await twoStage.classifyTwoStage(
      modelId,
      modelPath,
      'Test email subject',
      'This is a test email body to warm up the model.'
    );
    
    const loadTime = Date.now() - startTime;
    // Model preloaded successfully
    
    // Log the dummy result to verify it worked
    if (dummyResult.is_job_related !== undefined) {
      // Model test classification successful
    }
    
    return true;
  } catch (error) {
    // Failed to preload model - will be loaded on first use
    return false;
  }
}

/**
 * Preload multiple models (if needed in future)
 */
async function preloadModels(modelIds = []) {
  const results = [];
  for (const modelId of modelIds) {
    const modelsDir = path.join(os.homedir(), 'Library', 'Application Support', 'models');
    const modelPath = path.join(modelsDir, `${modelId}.gguf`);
    
    try {
      // Preloading model
      // Use classifyTwoStage with dummy email to preload the model
      await twoStage.classifyTwoStage(
        modelId,
        modelPath,
        'Preload test',
        'Preloading model cache'
      );
      results.push({ modelId, success: true });
    } catch (error) {
      // Failed to preload model
      results.push({ modelId, success: false, error: error.message });
    }
  }
  return results;
}

module.exports = {
  preloadDefaultModel,
  preloadModels
};