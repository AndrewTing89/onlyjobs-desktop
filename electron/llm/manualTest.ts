/**
 * Manual test for LLM engine
 * Tests parseEmailWithLLM with sample input
 */

import { parseEmailWithLLM } from './llmEngine';

const testCases = [
  {
    name: 'Job Application Confirmation',
    input: {
      subject: 'Application Received - Software Engineer at TechCorp',
      plaintext: 'Dear Candidate,\n\nThank you for applying to the Software Engineer position at TechCorp. We have received your application and will review it shortly.\n\nBest regards,\nHR Team'
    }
  },
  {
    name: 'Interview Invitation',
    input: {
      subject: 'Interview Invitation - Data Analyst Role',
      plaintext: 'Hi there,\n\nWe would like to schedule an interview for the Data Analyst position at Analytics Inc. Are you available next Tuesday?\n\nThanks,\nSarah'
    }
  },
  {
    name: 'Non-job Email',
    input: {
      subject: 'Your Netflix subscription expires soon',
      plaintext: 'Your monthly Netflix subscription will expire in 3 days. Please update your payment method to continue enjoying our services.'
    }
  }
];

async function runTests() {
  console.log('🧪 Starting LLM manual tests...\n');
  
  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.name}`);
    console.log(`📧 Input: "${testCase.input.subject}"`);
    
    try {
      const result = await parseEmailWithLLM(testCase.input);
      console.log('✅ Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
    
    console.log(''); // Empty line for readability
  }
}

// Run if called directly
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('🎉 Manual tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}