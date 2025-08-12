/**
 * Test script to demonstrate LLM-only pipeline with empty fallback + normalization
 * Shows the behavior when LLM fails and system falls back to empty + normalization
 */

const { getClassifierProvider } = require('../electron/classifier/providerFactory');

// Test cases
const testEmails = [
  {
    name: "Job Application (Subject extraction should work)",
    input: {
      subject: "Extend. Your application has been received for Software Engineer position",
      plaintext: "Thank you for your interest in joining our engineering team at Extend.",
      fromAddress: "careers@extend.com"
    }
  },
  {
    name: "Billing Email (Should be hard blocked)",
    input: {
      subject: "Your PG&E Energy Statement is Ready to View", 
      plaintext: "View your monthly energy usage and billing statement online.",
      fromAddress: "DoNotReply@billpay.pge.com"
    }
  },
  {
    name: "Workday Email (Vendor extraction should work)",
    input: {
      subject: "Application Status - Software Developer at TechCorp",
      plaintext: "Your application is being reviewed by our team.",
      fromAddress: "techcorp@myworkday.com"
    }
  },
  {
    name: "Interview Invitation (Status override should work)",
    input: {
      subject: "Interview Invitation - Data Analyst Role at DataCorp",
      plaintext: "We would like to schedule an interview with you for the Data Analyst position.",
      fromAddress: "hr@datacorp.com"
    }
  },
  {
    name: "Generic Email (Should get conservative empty result)",
    input: {
      subject: "Meeting reminder",
      plaintext: "Don't forget about our meeting tomorrow.",
      fromAddress: "colleague@company.com"
    }
  }
];

async function testFallbackBehavior() {
  console.log("🧪 TESTING LLM-ONLY PIPELINE WITH EMPTY FALLBACK + NORMALIZATION");
  console.log("=" .repeat(80));
  console.log("Note: LLM will fail to load, demonstrating empty fallback behavior\n");
  
  const classifier = getClassifierProvider();
  
  for (const testEmail of testEmails) {
    console.log(`📧 ${testEmail.name}`);
    console.log(`   Subject: "${testEmail.input.subject}"`);
    console.log(`   From: ${testEmail.input.fromAddress}`);
    
    try {
      const result = await classifier.parse(testEmail.input);
      
      console.log("📊 RESULT:");
      console.log(`   Job Related: ${result.is_job_related}`);
      console.log(`   Company: "${result.company}"`);
      console.log(`   Position: "${result.position}"`);
      console.log(`   Status: "${result.status}"`);
      console.log(`   Confidence: ${result.confidence}`);
      
      if (result.decisionPath) {
        console.log(`   Decision Path: ${result.decisionPath}`);
      }
      
      if (result.notes && result.notes.length > 0) {
        console.log(`   Applied Rules: ${result.notes.join(', ')}`);
      }
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
    
    console.log("-".repeat(40));
  }
  
  console.log("\n✅ Test completed!");
  console.log("\nKey Behaviors Demonstrated:");
  console.log("• LLM fails → Empty baseline created");
  console.log("• Normalization salvages data from subject/vendor patterns");
  console.log("• Billing domains hard blocked with low confidence");
  console.log("• Conservative defaults (false/null) when uncertain");
  console.log("• Enhanced observability with decision paths and notes");
}

testFallbackBehavior().catch(console.error);