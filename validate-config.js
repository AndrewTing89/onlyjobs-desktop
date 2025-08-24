#!/usr/bin/env node

// EMERGENCY CONFIG VALIDATION SCRIPT
// This script validates that the LLM configuration is being loaded correctly

const path = require('path');

console.log('🔍 EMERGENCY CONFIG VALIDATION');
console.log('=' .repeat(50));

// Clear require cache for fresh reload
function clearRequireCache() {
  const llmPath = path.resolve(__dirname, 'electron/llm');
  const modules = Object.keys(require.cache);
  
  for (const module of modules) {
    if (module.includes(llmPath)) {
      console.log(`📝 Clearing cached module: ${module}`);
      delete require.cache[module];
    }
  }
}

console.log('🧹 Clearing Node.js module cache...');
clearRequireCache();

console.log('\n📋 Loading configuration...');
try {
  const config = require('./electron/llm/config.js');
  
  console.log('\n✅ Configuration loaded successfully!');
  console.log(`📊 STAGE1_TIMEOUT: ${config.STAGE1_TIMEOUT}ms (expected: 3000ms)`);
  console.log(`📊 STAGE2_TIMEOUT: ${config.STAGE2_TIMEOUT}ms (expected: 6000ms)`);  
  console.log(`📊 STAGE1_CONTEXT: ${config.STAGE1_CONTEXT} tokens (expected: 512)`);
  console.log(`📊 STAGE2_CONTEXT: ${config.STAGE2_CONTEXT} tokens (expected: 1024)`);
  console.log(`📊 LLM_CONTEXT: ${config.LLM_CONTEXT} tokens (expected: 512)`);
  console.log(`📊 FALLBACK_THRESHOLD: ${config.FALLBACK_THRESHOLD}ms (expected: 2500ms)`);
  
  // Validation
  const issues = [];
  
  if (config.STAGE1_TIMEOUT !== 3000) {
    issues.push(`❌ STAGE1_TIMEOUT is ${config.STAGE1_TIMEOUT}ms, should be 3000ms`);
  }
  
  if (config.STAGE2_TIMEOUT !== 6000) {
    issues.push(`❌ STAGE2_TIMEOUT is ${config.STAGE2_TIMEOUT}ms, should be 6000ms`);
  }
  
  if (config.STAGE1_CONTEXT !== 512) {
    issues.push(`❌ STAGE1_CONTEXT is ${config.STAGE1_CONTEXT}, should be 512`);
  }
  
  if (config.STAGE2_CONTEXT !== 1024) {
    issues.push(`❌ STAGE2_CONTEXT is ${config.STAGE2_CONTEXT}, should be 1024`);
  }
  
  if (config.LLM_CONTEXT !== 512) {
    issues.push(`❌ LLM_CONTEXT is ${config.LLM_CONTEXT}, should be 512`);
  }
  
  if (issues.length === 0) {
    console.log('\n🎉 ALL CONFIGURATION VALUES ARE CORRECT!');
    console.log('✅ Emergency fixes should be active.');
  } else {
    console.log('\n⚠️  CONFIGURATION ISSUES FOUND:');
    issues.forEach(issue => console.log(issue));
  }
  
} catch (error) {
  console.error('\n❌ Failed to load configuration:', error.message);
  process.exit(1);
}

console.log('\n📝 Testing prompts...');
try {
  const prompts = require('./electron/llm/prompts.js');
  
  console.log(`✅ System prompt length: ${prompts.SYSTEM_PROMPT.length} chars`);
  console.log(`📋 System prompt preview: "${prompts.SYSTEM_PROMPT.substring(0, 80)}..."`);
  
  const testPrompt = prompts.userPrompt("Test Subject", "Test body content");
  console.log(`✅ User prompt length: ${testPrompt.length} chars`);
  
  if (prompts.SYSTEM_PROMPT.includes('JSON only')) {
    console.log('✅ Ultra-minimal prompts are active!');
  } else {
    console.log('❌ Old verbose prompts are still being used!');
  }
  
} catch (error) {
  console.error('\n❌ Failed to load prompts:', error.message);
}

console.log('\n🔬 Testing LLM engine import...');
try {
  const llmEngine = require('./electron/llm/llmEngine.js');
  console.log('✅ LLM engine loaded successfully');
  
  if (llmEngine.classifyEmail) {
    console.log('✅ Stage 1 classification function found');
  }
  
  if (llmEngine.parseJobEmail) {
    console.log('✅ Stage 2 parsing function found');
  }
  
} catch (error) {
  console.error('\n❌ Failed to load LLM engine:', error.message);
}

console.log('\n🎯 VALIDATION COMPLETE');
console.log('If issues were found, restart the Electron app to load the fixes.');