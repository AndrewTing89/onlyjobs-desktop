// Simple LLM health check without IPC complexity
const { classifyEmail } = require('./electron/llm/llmEngine');

async function checkLLMHealth() {
  console.log('🏥 LLM Health Check\n');
  
  // Test 1: Basic classification
  console.log('Test 1: Basic Indeed email classification');
  const testEmail = {
    subject: "Software Engineer @ Google",
    plaintext: "We found a job that matches your search criteria. Software Engineer at Google. Full-time remote position. $150k-$200k salary range.",
    from: "Indeed <donotreply@match.indeed.com>"
  };
  
  try {
    const result = await classifyEmail(testEmail);
    console.log(`✅ Classification successful: is_job_related=${result.is_job_related}`);
    
    if (!result.is_job_related) {
      console.log('⚠️  WARNING: Indeed email classified as non-job-related - prompt may need adjustment');
    }
  } catch (error) {
    console.log(`❌ Classification failed: ${error.message}`);
    return false;
  }
  
  // Test 2: Performance check
  console.log('\nTest 2: Performance timing check');
  const start = Date.now();
  try {
    await classifyEmail(testEmail);
    const elapsed = Date.now() - start;
    console.log(`✅ Classification completed in ${elapsed}ms`);
    
    if (elapsed > 10000) {
      console.log('⚠️  WARNING: Classification took longer than expected (>10s)');
    }
  } catch (error) {
    console.log(`❌ Performance test failed: ${error.message}`);
    return false;
  }
  
  // Test 3: Multiple classifications (circuit breaker test)
  console.log('\nTest 3: Multiple classifications (circuit breaker stress test)');
  let successes = 0;
  let failures = 0;
  
  for (let i = 0; i < 3; i++) {
    try {
      await classifyEmail({
        subject: `Test Email #${i+1}`,
        plaintext: `This is a test email number ${i+1} to check LLM stability.`,
        from: "test@example.com"
      });
      successes++;
      console.log(`  ✅ Test ${i+1}/3 successful`);
    } catch (error) {
      failures++;
      console.log(`  ❌ Test ${i+1}/3 failed: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Results: ${successes} successes, ${failures} failures`);
  
  if (failures > successes) {
    console.log('🚫 LLM appears to be experiencing significant issues');
    console.log('   This could be causing the sync button to fail');
    return false;
  }
  
  console.log('✅ LLM health check passed - LLM is working properly');
  return true;
}

checkLLMHealth().catch(console.error);