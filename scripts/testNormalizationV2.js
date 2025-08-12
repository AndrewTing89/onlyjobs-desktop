/**
 * Test script to demonstrate Normalization v2 improvements
 * Shows before/after comparison of enhanced extraction capabilities
 */

const { normalizeEmailClassification } = require('../electron/classifier/normalize.runtime.js');

// Test cases demonstrating the 9 key improvements
const testCases = [
  {
    name: "1. Billing Domain Hard Block",
    email: {
      subject: "Your PG&E Energy Statement is Ready to View",
      plaintext: "View your monthly energy usage and billing statement online.",
      from_address: "DoNotReply@billpay.pge.com"
    },
    current: {
      is_job_related: true,
      company: "a subsidiary of PG&E", 
      position: "Unknown Position",
      status: "Applied",
      confidence: 0.5
    }
  },
  {
    name: "2. Enhanced Subject Extraction - Company",
    email: {
      subject: "Extend. Your application has been received for the role of Software Engineer",
      plaintext: "Thank you for your interest in joining our team.",
      from_address: "careers@extend.com"
    },
    current: {
      is_job_related: true,
      company: "Unknown Company",
      position: "Unknown Position", 
      status: "Applied",
      confidence: 0.7
    }
  },
  {
    name: "3. Enhanced Subject Extraction - Status Priority",
    email: {
      subject: "Congratulations! We are pleased to offer you the Senior Engineer position",
      plaintext: "Please review the attached offer details.",
      from_address: "hr@company.com"
    },
    current: {
      is_job_related: true,
      company: "Company",
      position: "Engineer",
      status: "Interview", // Should be overridden to "Offer"
      confidence: 0.6
    }
  },
  {
    name: "4. Workday Vendor Enhancement",
    email: {
      subject: "Workday @ IngramMicro - Application Status Update", 
      plaintext: "Your application has been received and is under review.",
      from_address: "ingrammicro@myworkday.com"
    },
    current: {
      is_job_related: true,
      company: "Unknown Company",
      position: "Unknown Position",
      status: "Applied",
      confidence: 0.5
    }
  },
  {
    name: "5. Canonical Brand Mapping",
    email: {
      subject: "Thank you for your application to microsoft",
      plaintext: "We have received your application for the Software Engineer position.",
      from_address: "careers@microsoft.com"
    },
    current: {
      is_job_related: true,
      company: "microsoft", // Should be canonicalized to "Microsoft"
      position: "Software Engineer",
      status: "Applied",
      confidence: 0.8
    }
  }
];

console.log("🧪 NORMALIZATION V2 TEST RESULTS");
console.log("=" .repeat(60));

for (const testCase of testCases) {
  console.log(`\n📧 ${testCase.name}`);
  console.log(`Subject: "${testCase.email.subject}"`);
  console.log(`From: ${testCase.email.from_address}`);
  
  const result = normalizeEmailClassification(testCase.email, testCase.current);
  
  console.log("\n📊 BEFORE vs AFTER:");
  console.log(`   Job Related: ${testCase.current.is_job_related} → ${result.normalized.is_job_related}`);
  console.log(`   Company:     "${testCase.current.company}" → "${result.normalized.company}"`);
  console.log(`   Position:    "${testCase.current.position}" → "${result.normalized.position}"`);
  console.log(`   Status:      "${testCase.current.status}" → "${result.normalized.status}"`);
  console.log(`   Confidence:  ${testCase.current.confidence} → ${result.normalized.confidence}`);
  
  if (result.notes && result.notes.length > 0) {
    console.log(`   Rules Applied: ${result.notes.join(', ')}`);
  }
  
  if (result.decisionPathSuffix) {
    console.log(`   Decision Path: ${result.decisionPathSuffix}`);
  }
  
  console.log("-".repeat(40));
}

console.log("\n✅ All normalization v2 enhancements demonstrated!");
console.log("\nKey Improvements Shown:");
console.log("• Billing/utility domain hard blocking");
console.log("• Enhanced subject-first extraction patterns");
console.log("• Vendor-specific heuristics (Workday)");  
console.log("• Strong status override with priority system");
console.log("• Canonical brand mapping");
console.log("• Enhanced observability with decision tracking");