const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { LLM_CONTEXT } = require('./config');

// Default Mistral-7B prompt with few-shot learning
const DEFAULT_MISTRAL_PROMPT = `[INST] You are a job application email classifier. Analyze emails and return ONLY a JSON object.

Examples of correct classification:

Email: "From: noreply@myworkday.com
Subject: Your one-time passcode
Your one-time passcode: 123456"
Output: {"is_job_related":true,"company":null,"position":null,"status":null}

Email: "From: careers@acme.com
Subject: Application Received - Senior Data Analyst
Thank you for applying to the Senior Data Analyst position at Acme Corp."
Output: {"is_job_related":true,"company":"Acme","position":"Senior Data Analyst","status":"Applied"}

Email: "From: noreply@myworkday.com
Subject: Application Update
Your application for Software Engineer II at TechCorp has been received."
Output: {"is_job_related":true,"company":"TechCorp","position":"Software Engineer II","status":"Applied"}

Email: "From: hr@initech.com
Subject: Your Application Status
We regret to inform you that we will not be moving forward with your candidacy."
Output: {"is_job_related":true,"company":"Initech","position":null,"status":"Declined"}

Email: "From: talent@nestlé.com
Subject: Data Scientist Application Update
Thank you for applying to the Data Scientist position. We have decided to pursue other applicants."
Output: {"is_job_related":true,"company":"Nestlé","position":"Data Scientist","status":"Declined"}

Classification rules:
- Job-related: Applications, interviews, offers, rejections, ATS emails (Workday OTP, HackerRank, Codility)
- Not job-related: Newsletters, marketing, social media

Status priority (rejection overrides application):
- Declined: "regret", "unfortunately", "not selected", "not moving forward", "pursue other"
- Offer: "offer", "compensation", "pleased to offer"
- Interview: "interview", "schedule", "assessment", "coding challenge"
- Applied: "application received", "thank you for applying", "under review"

Company extraction:
- From ATS domains (@myworkday.com, @greenhouse.io) extract from body "at [Company]"
- Clean names: "Google Inc." → "Google"
- Return null if unknown

Position extraction:
- Clean codes: "R123 Data Analyst" → "Data Analyst"
- Standardize: "SWE" → "Software Engineer"
- Return null if unknown

Analyze this email and output JSON:
[/INST]`;

class PromptManager {
  constructor() {
    this.promptFilePath = path.join(app.getPath('userData'), 'mistralPrompt.txt');
    this.cachedPrompt = null;
    this.isCustom = false;
    this.llamaModel = null;
    this.contextSize = LLM_CONTEXT || 2048;
  }

  // Estimate token count (rough approximation when model not loaded)
  estimateTokenCount(text) {
    if (!text) return 0;
    // Rough estimation: ~0.75 tokens per character for English text
    // This is a conservative estimate for Mistral models
    return Math.ceil(text.length * 0.75 / 4);
  }

  // Get accurate token count using the actual model tokenizer
  async getAccurateTokenCount(text) {
    try {
      // If we have the llama module loaded, use it for accurate counting
      const llamaModule = await this.getLlamaModule();
      if (llamaModule && this.llamaModel) {
        const tokens = await this.llamaModel.tokenize(text);
        return tokens.length;
      }
    } catch (error) {
      console.log('Using estimation for token count:', error.message);
    }
    // Fall back to estimation
    return this.estimateTokenCount(text);
  }

  async getLlamaModule() {
    try {
      if (!this.llamaModule) {
        this.llamaModule = await import('node-llama-cpp');
      }
      return this.llamaModule;
    } catch (error) {
      // Module not available, use estimation
      return null;
    }
  }

  async getPrompt() {
    try {
      // Try to read custom prompt
      const customPrompt = await fs.readFile(this.promptFilePath, 'utf-8');
      this.cachedPrompt = customPrompt;
      this.isCustom = true;
      return { success: true, prompt: customPrompt, isCustom: true };
    } catch (error) {
      // File doesn't exist, return default prompt
      this.cachedPrompt = DEFAULT_MISTRAL_PROMPT;
      this.isCustom = false;
      return { success: true, prompt: DEFAULT_MISTRAL_PROMPT, isCustom: false };
    }
  }

  async setPrompt(prompt) {
    try {
      // Validate prompt
      if (!prompt || typeof prompt !== 'string') {
        throw new Error('Invalid prompt: must be a non-empty string');
      }

      // Validate Mistral format
      if (!prompt.includes('[INST]') || !prompt.includes('[/INST]')) {
        throw new Error('Prompt must use Mistral instruction format with [INST]...[/INST] tags');
      }

      // Write to file
      await fs.writeFile(this.promptFilePath, prompt, 'utf-8');
      
      // Update cache
      this.cachedPrompt = prompt;
      this.isCustom = true;

      // Clear LLM session cache (this will be handled by llmEngine)
      // The next classification will use the new prompt
      
      return { success: true };
    } catch (error) {
      console.error('Error setting prompt:', error);
      return { success: false, error: error.message };
    }
  }

  async resetPrompt() {
    try {
      // Delete custom prompt file
      try {
        await fs.unlink(this.promptFilePath);
      } catch (error) {
        // File might not exist, that's ok
      }
      
      // Reset cache
      this.cachedPrompt = DEFAULT_MISTRAL_PROMPT;
      this.isCustom = false;
      
      return { success: true, prompt: DEFAULT_MISTRAL_PROMPT };
    } catch (error) {
      console.error('Error resetting prompt:', error);
      return { success: false, error: error.message };
    }
  }

  async getPromptInfo() {
    try {
      let customPromptLength = 0;
      let isCustom = false;
      
      try {
        const customPrompt = await fs.readFile(this.promptFilePath, 'utf-8');
        customPromptLength = customPrompt.length;
        isCustom = true;
      } catch (error) {
        // No custom prompt
      }
      
      return {
        success: true,
        info: {
          isCustom,
          defaultPromptLength: DEFAULT_MISTRAL_PROMPT.length,
          customPromptLength,
          promptPath: this.promptFilePath,
          modelInfo: {
            name: 'Mistral-7B-Instruct',
            quantization: 'Q4_K_M',
            contextSize: 8192,
            instructFormat: '[INST]...[/INST]'
          }
        }
      };
    } catch (error) {
      console.error('Error getting prompt info:', error);
      return { success: false, error: error.message };
    }
  }

  async testPrompt(prompt, email) {
    try {
      // This would ideally call the LLM engine with the test prompt
      // For now, we'll return a mock result
      console.log('Testing prompt with email:', email);
      
      // Import the LLM engine dynamically
      const { parseEmailWithLLM } = require('./llmEngine');
      
      // Temporarily use the test prompt
      const originalPrompt = this.cachedPrompt;
      this.cachedPrompt = prompt;
      
      try {
        const result = await parseEmailWithLLM({
          subject: email.subject || '',
          plaintext: email.body || '',
          from: email.from || ''
        });
        
        return { success: true, result };
      } finally {
        // Restore original prompt
        this.cachedPrompt = originalPrompt;
      }
    } catch (error) {
      console.error('Error testing prompt:', error);
      return { success: false, error: error.message };
    }
  }

  // Get the current prompt for use by llmEngine
  getCurrentPrompt() {
    return this.cachedPrompt || DEFAULT_MISTRAL_PROMPT;
  }
}

module.exports = {
  PromptManager,
  DEFAULT_MISTRAL_PROMPT
};