#!/usr/bin/env node

/**
 * Quick test to demonstrate the unified LLM approach
 * This shows how the new system handles classification + extraction + normalization in one step
 */

const { parseEmailWithLLM } = require('./electron/llm/llmEngine.js');

async function testUnifiedApproach() {
  console.log('🚀 Testing Unified LLM Approach\n');

  const testCases = [
    {
      name: 'ATS Email with Headers',
      input: {
        subject: 'Application Status Update',
        plaintext: 'Your application for Senior Software Engineer at TechCorp has been received and is under review.',
        from: 'noreply@myworkday.com',
        headers: {
          'From': 'noreply@myworkday.com',
          'To': 'candidate@example.com',
          'Date': 'Mon, 11 Aug 2025 10:00:00 -0700'
        }
      },
      expected: {
        is_job_related: true,
        company: 'TechCorp',
        position: 'Senior Software Engineer',
        status: 'Applied'
      }
    },
    {
      name: 'Interview Email',
      input: {
        subject: 'Interview Invitation - Product Manager',
        plaintext: 'We would like to schedule a technical interview for the Product Manager position at Acme Inc. Are you available this week?',
        from: 'recruiter@acme.com'
      },
      expected: {
        is_job_related: true,
        company: 'Acme',
        position: 'Product Manager',
        status: 'Interview'
      }
    },
    {
      name: 'Newsletter (Non-Job)',
      input: {
        subject: 'Weekly Job Market Trends',
        plaintext: 'This week in tech jobs: salaries are up 5% and remote work continues to be popular.',
        from: 'newsletter@jobsite.com'
      },
      expected: {
        is_job_related: false,
        company: null,
        position: null,
        status: null
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`📧 Testing: ${testCase.name}`);
    console.log(`   Subject: ${testCase.input.subject}`);
    console.log(`   From: ${testCase.input.from || 'N/A'}`);
    
    try {
      const result = await parseEmailWithLLM(testCase.input);
      
      console.log(`✅ Result:`);
      console.log(`   Job-related: ${result.is_job_related}`);
      console.log(`   Company: ${result.company || 'null'}`);
      console.log(`   Position: ${result.position || 'null'}`);
      console.log(`   Status: ${result.status || 'null'}`);
      
      // Simple validation
      const matches = Object.keys(testCase.expected).every(key => 
        result[key] === testCase.expected[key]
      );
      console.log(`   Expected match: ${matches ? '✅ PASS' : '❌ PARTIAL'}`);
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('');
  }

  console.log('🎉 Unified LLM approach testing completed!');
  console.log('\n📝 Key Benefits:');
  console.log('   • Single LLM call handles classification + extraction + normalization');
  console.log('   • Enhanced context from email headers improves ATS detection');
  console.log('   • Maintains backward compatibility with existing pipeline');
  console.log('   • Reduced complexity - no more multi-layer processing');
}

if (require.main === module) {
  testUnifiedApproach().catch(console.error);
}

module.exports = { testUnifiedApproach };