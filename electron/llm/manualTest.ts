/**
 * Manual test for LLM engine
 * Tests parseEmailWithLLM with sample input
 */

import { parseEmailWithLLM, parseEmailWithTwoStage } from './llmEngine';

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
  },
  {
    name: 'CRITICAL TEST: Indeed Email #1 - Visa Position',
    input: {
      subject: 'Indeed Application: Analyst, Data Strategy & Communication',
      plaintext: 'Application submitted, Analyst, Data Strategy & Communication, Visa - San Francisco, California'
    },
    expected: {
      is_job_related: true,
      company: 'Visa',
      position: 'Analyst, Data Strategy & Communication',
      status: 'Applied'
    }
  },
  {
    name: 'CRITICAL TEST: Indeed Email #2 - Sia Position',
    input: {
      subject: 'Indeed Application: Consultant- Data Analyst',
      plaintext: 'Application submitted, Consultant- Data Analyst, Sia - San Francisco, California'
    },
    expected: {
      is_job_related: true,
      company: 'Sia',
      position: 'Consultant- Data Analyst',
      status: 'Applied'
    }
  },
  {
    name: 'CRITICAL TEST: Indeed Email #3 - Microsoft Position',
    input: {
      subject: 'Indeed Application: Senior Software Engineer',
      plaintext: 'Application submitted, Senior Software Engineer, Microsoft - Seattle, Washington. Good luck with your application!'
    },
    expected: {
      is_job_related: true,
      company: 'Microsoft',
      position: 'Senior Software Engineer',
      status: 'Applied'
    }
  },
  {
    name: 'CRITICAL TEST: LinkedIn Job Board Email',
    input: {
      subject: 'You applied to Product Manager at Google',
      plaintext: 'Your application for Product Manager at Google has been submitted through LinkedIn. We will notify you of any updates.'
    },
    expected: {
      is_job_related: true,
      company: 'Google',
      position: 'Product Manager',
      status: 'Applied'
    }
  },
  {
    name: 'CRITICAL TEST: ZipRecruiter Job Board Email',
    input: {
      subject: 'Application Confirmation - Data Scientist',
      plaintext: 'You applied to Data Scientist at Netflix through ZipRecruiter. We will notify you of any updates from the employer.'
    },
    expected: {
      is_job_related: true,
      company: 'Netflix',
      position: 'Data Scientist',
      status: 'Applied'
    }
  }
];

async function runTests() {
  console.log('🧪 Starting LLM manual tests...\n');
  
  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.name}`);
    console.log(`📧 Input: "${testCase.input.subject}"`);
    
    try {
      // Test both unified and two-stage approaches
      console.log('🔄 Testing Two-Stage Approach:');
      const twoStageResult = await parseEmailWithTwoStage(testCase.input);
      console.log('🎯 Two-Stage Result:', JSON.stringify(twoStageResult, null, 2));
      
      console.log('🔄 Testing Unified Approach:');
      const unifiedResult = await parseEmailWithLLM(testCase.input);
      console.log('🔧 Unified Result:', JSON.stringify(unifiedResult, null, 2));
      
      // Validate critical test cases (using two-stage as primary)
      if (testCase.expected) {
        const result = twoStageResult; // Use two-stage as primary
        const validations = [];
        if (result.company !== testCase.expected.company) {
          validations.push(`❌ COMPANY MISMATCH: Expected "${testCase.expected.company}", got "${result.company}"`);
        }
        if (result.position !== testCase.expected.position) {
          validations.push(`❌ POSITION MISMATCH: Expected "${testCase.expected.position}", got "${result.position}"`);
        }
        if (result.status !== testCase.expected.status) {
          validations.push(`❌ STATUS MISMATCH: Expected "${testCase.expected.status}", got "${result.status}"`);
        }
        if (result.is_job_related !== testCase.expected.is_job_related) {
          validations.push(`❌ JOB_RELATED MISMATCH: Expected ${testCase.expected.is_job_related}, got ${result.is_job_related}`);
        }
        
        if (validations.length === 0) {
          console.log('🎉 TWO-STAGE VALIDATION PASSED: All fields match expected values');
        } else {
          console.log('🚨 TWO-STAGE VALIDATION FAILED:');
          validations.forEach(v => console.log(`  ${v}`));
        }
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
    
    console.log(''); // Empty line for readability
  }
}

// Export for testing 
export { runTests, testCases };

// Run if called directly
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('🎉 Manual tests completed!');
      console.log('📝 Summary: Tested job board email classification with focus on Indeed platform detection');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}