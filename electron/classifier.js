// Wrapper for two-stage classifier to maintain compatibility with existing code
const twoStage = require('./llm/two-stage-classifier');

function getClassifierProvider() {
  return {
    // Main classification method used by sync process
    parse: async ({ subject, plaintext, modelId = null }) => {
      try {
        // Use provided model or default to Llama
        const defaultModelId = 'llama-3-8b-instruct-q5_k_m';
        const selectedModelId = modelId || defaultModelId;
        
        // Build model path
        const modelPath = `/Users/ndting/Library/Application Support/models/${selectedModelId}.gguf`;
        
        console.log(`[Classifier] Using model: ${selectedModelId}`);
        
        // Perform two-stage classification
        const result = await twoStage.classifyTwoStage(selectedModelId, modelPath, subject, plaintext);
        
        // Map the result to expected format
        return {
          is_job_related: result.is_job_related,
          company: result.company,
          position: result.position,
          status: result.status,
          // Additional metadata from two-stage classification
          stage1_result: result.stage1_result,
          stage1_time_ms: result.stage1_time_ms,
          stage2_time_ms: result.stage2_time_ms,
          total_time_ms: result.total_time_ms
        };
      } catch (error) {
        console.error('[Classifier] Error in classification:', error);
        // Return safe default on error
        return {
          is_job_related: false,
          company: null,
          position: null,
          status: null,
          error: error.message
        };
      }
    },
    
    // Health check method
    isReady: async () => {
      return true; // LLM models are checked separately
    }
  };
}

module.exports = { getClassifierProvider };