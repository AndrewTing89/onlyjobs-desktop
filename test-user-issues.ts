import { parseEmailWithTwoStage } from './electron/llm/llmEngine';

async function testUserIssues() {
  console.log('🧪 Testing specific user issues...\n');

  // Test 1: Elevance Health position extraction (was extracting "R123Hello Alex")
  console.log('📋 Test 1: Elevance Health position extraction');
  const elevanceTest = await parseEmailWithTwoStage({
    subject: "R123Hello Alex Thank you for your interest in a career with The Elevance Health Companies, Inc.",
    plaintext: `Hello Alex

Thank you for your interest in a career with The Elevance Health Companies, Inc. . We have successfully received your application for Health Information Consultant ( JR156260 ). If your skills and experience are a good match for the requirements of the position, a recruiter will be in touch with next steps.

Thank you,
Elevance Health Talent Acquisition Team

Elevance Health is an Equal Employment Opportunity employer and all qualified applicants will receive consideration for employment without regard to age, citizenship status, color, creed, disability, ethnicity, genetic information, gender (including gender identity and gender expression), marital status, national origin, race, religion, sex, sexual orientation, veteran status or any other status or condition protected by applicable federal, state, or local laws.

This email box is not monitored. Please do not reply to this message.`
  });
  
  console.log('🎯 Result:', JSON.stringify(elevanceTest, null, 2));
  console.log('✅ Expected: position="Health Information Consultant" (NOT "R123Hello Alex")');
  console.log('✅ Expected: company="Elevance Health"');
  console.log('✅ Expected: status="Applied"');
  console.log('✅ Expected: is_job_related=true\n');

  // Test 2: Super Micro Computer talent community (should be non-job-related)
  console.log('📋 Test 2: Super Micro Computer talent community classification');
  const talentCommunityTest = await parseEmailWithTwoStage({
    subject: "Your Job Alert - Super Micro Computer Opportunities",
    plaintext: `You are receiving this email because you joined the Super Micro Computer Talent Community on 7/23/25. You will receive these messages every 7 day(s). Your Job Alert matched the following jobs at jobs.supermicro.com.

Jobs
Operation Specialist - San Jose, California, United States
Sr. Data Center Cabling Specialist - San Jose, California, United States
Manager, Data Center Operations - San Jose, California, United States
Sales Support Specialist - San Jose, California, United States
Manufacture Engineer - Equipment - San Jose, California, United States
Manufacturing Engineer - San Jose, California, United States
Manufacturing Engineer - San Jose, California, United States
Director, Solution Engineering - San Jose, California, United States
Sr. Cost Control Analyst - San Jose, California, United States
Thermal Engineer - San Jose, California, United States

Manage your Job Alerts`
  });
  
  console.log('🎯 Result:', JSON.stringify(talentCommunityTest, null, 2));
  console.log('✅ Expected: is_job_related=false (this is a job recommendation, NOT a user application)');
  console.log('✅ Expected: company=null, position=null, status=null\n');

  console.log('🎉 User issue tests completed!');

  // Summary
  console.log('\n📊 SUMMARY:');
  console.log('Issue 1 (Position Extraction):', elevanceTest.position === 'Health Information Consultant' ? '✅ FIXED' : '❌ STILL BROKEN');
  console.log('Issue 2 (Job Recommendation):', talentCommunityTest.is_job_related === false ? '✅ FIXED' : '❌ STILL BROKEN');
}

testUserIssues().catch(console.error);