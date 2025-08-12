/**
 * Test normalization with specific problematic samples
 */

const fs = require('fs');
const path = require('path');

async function testNormalization() {
  console.log('🧪 Testing normalization with problematic samples...');
  
  try {
    // Import normalization function  
    const { normalizeResult } = await import('../electron/classifier/normalize.js');
    
    // Load test fixtures
    const inputsPath = path.join(__dirname, '../fixtures/normalize/inputs.json');
    const expectedPath = path.join(__dirname, '../fixtures/normalize/expected.json');
    
    if (!fs.existsSync(inputsPath) || !fs.existsSync(expectedPath)) {
      throw new Error('Test fixtures not found. Please run the full setup first.');
    }
    
    const inputs = JSON.parse(fs.readFileSync(inputsPath, 'utf8'));
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    
    console.log(`📋 Running ${inputs.length} normalization tests...\\n`);
    
    let passed = 0;
    let failed = 0;
    
    for (let i = 0; i < inputs.length; i++) {
      const testCase = inputs[i];
      const expectedResult = expected.find(e => e.id === testCase.id)?.expected;
      
      if (!expectedResult) {
        console.log(`⚠️ No expected result for test case: ${testCase.id}`);
        continue;
      }
      
      try {
        console.log(`🔍 Test: ${testCase.description}`);
        console.log(`📧 From: ${testCase.input.fromAddress}`);
        console.log(`📧 Subject: "${testCase.input.subject}"`);
        
        const result = normalizeResult(testCase.input, testCase.llm);
        
        // Check results
        const companyMatch = result.company === expectedResult.company;
        const positionMatch = result.position === expectedResult.position;
        const statusMatch = result.status === expectedResult.status;
        const isJobMatch = result.is_job_related === expectedResult.is_job_related;
        
        const allMatch = companyMatch && positionMatch && statusMatch && isJobMatch;
        
        if (allMatch) {
          passed++;
          console.log('✅ PASS');
        } else {
          failed++;
          console.log('❌ FAIL');
          console.log('   Expected:', JSON.stringify(expectedResult, null, 4));
          console.log('   Actual:', JSON.stringify({
            is_job_related: result.is_job_related,
            company: result.company,
            position: result.position,
            status: result.status,
            notes: result.notes
          }, null, 4));
        }
        
        console.log(`   Result: company="${result.company}", position="${result.position}", status="${result.status}"`);
        if (result.notes) {
          console.log(`   Applied: ${result.notes.join(', ')}`);
        }
        console.log('');
        
      } catch (error) {
        failed++;
        console.log(`❌ ERROR: ${error.message}`);
        console.log('');
      }
    }
    
    // Summary
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(40));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Success Rate: ${Math.round(passed / (passed + failed) * 100)}%`);
    
    if (failed === 0) {
      console.log('\\n🎉 All tests passed! Normalization is working correctly.');
    } else {
      console.log('\\n⚠️ Some tests failed. Review the output above for details.');
    }
    
    return failed === 0;
    
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
    return false;
  }
}

async function main() {
  const success = await testNormalization();
  process.exit(success ? 0 : 1);
}

main().catch(console.error);