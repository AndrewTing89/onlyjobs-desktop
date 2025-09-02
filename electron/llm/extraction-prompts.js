/**
 * Optimized Job Email Extraction Prompts
 * Based on 2024 research and best practices
 */

// Few-shot examples for common patterns
const EXTRACTION_EXAMPLES = {
  linkedin: [
    {
      input: "Subject: Your application to Business Intelligence Developer at Milestone Technologies, Inc.",
      output: {
        company: "Milestone Technologies, Inc.",
        position: "Business Intelligence Developer",
        status: "Applied",
        location: null,
        remote_status: null,
        salary_range: null
      }
    },
    {
      input: "Subject: Andrew, your application was sent to Kforce Inc",
      output: {
        company: "Kforce Inc",
        position: null,
        status: "Applied",
        location: null,
        remote_status: null,
        salary_range: null
      }
    }
  ],
  recruiter: [
    {
      input: "Subject: Analytics Engineer opportunity\nBody: Hi Andrew, I have an exciting Analytics Engineer role at DataCorp in San Francisco (hybrid). Salary range: $120-150k",
      output: {
        company: "DataCorp",
        position: "Analytics Engineer",
        status: "Opportunity",
        location: "San Francisco",
        remote_status: "hybrid",
        salary_range: "$120-150k"
      }
    }
  ],
  ats: [
    {
      input: "Subject: Thank You For Applying!\nFrom: Workday.Notifications@viavisolutions.com",
      output: {
        company: "Viavi Solutions",
        position: null,
        status: "Applied",
        location: null,
        remote_status: null,
        salary_range: null
      }
    }
  ]
};

// Model-specific optimized prompts with few-shot learning
const OPTIMIZED_EXTRACTION_PROMPTS = {
  // Llama-3 models - structured with explicit field definitions
  'llama-3-8b-instruct-q5_k_m': `Extract job details from the email into JSON format.

Fields to extract:
- company: Company name (extract from subject, sender domain, or body)
- position: Job title/role
- status: One of [Applied, Interview, Assessment, Offer, Rejected, Opportunity]
- location: City, State or Country if mentioned
- remote_status: One of [remote, hybrid, onsite] if mentioned
- salary_range: Salary information if mentioned

Examples:
1. "Your application to Data Analyst at Google Inc" → {"company":"Google Inc","position":"Data Analyst","status":"Applied","location":null,"remote_status":null,"salary_range":null}
2. "Interview invitation from Meta" → {"company":"Meta","position":null,"status":"Interview","location":null,"remote_status":null,"salary_range":null}

Output ONLY valid JSON. Use null for unknown fields.`,

  'llama-3.2-3b-instruct-q5_k_m': `Extract job details as JSON:
{"company":"...","position":"...","status":"...","location":"...","remote_status":"...","salary_range":"..."}

Status options: Applied, Interview, Assessment, Offer, Rejected, Opportunity
Remote options: remote, hybrid, onsite
Use null for unknown fields. Output JSON only.`,

  // Qwen models - hierarchy with headers and step-by-step
  'qwen2.5-7b-instruct-q5_k_m': `Task: Extract job information from email

Step 1: Identify company (from subject, sender, or body)
Step 2: Extract position/role if mentioned
Step 3: Determine status (Applied/Interview/Assessment/Offer/Rejected/Opportunity)
Step 4: Find location and remote status if mentioned
Step 5: Extract salary if mentioned

Output format:
{"company":"...","position":"...","status":"...","location":"...","remote_status":"...","salary_range":"..."}

Examples:
- LinkedIn: "Your application to [POSITION] at [COMPANY]" → Extract both
- Recruiter: "[POSITION] opportunity" → Status is "Opportunity"
- ATS: Extract company from sender domain

Output JSON only. Use null for missing fields.`,

  'qwen2.5-3b-instruct-q5_k_m': `Extract: company, position, status, location, remote_status, salary_range
Status: Applied|Interview|Assessment|Offer|Rejected|Opportunity
JSON only: {"company":"...","position":"...","status":"...","location":"...","remote_status":"...","salary_range":"..."}`,

  // Phi models - concise and direct
  'phi-3.5-mini-instruct-q5_k_m': `Extract job details:
- Company (from subject/sender/body)
- Position (job title)
- Status (Applied/Interview/Assessment/Offer/Rejected/Opportunity)
- Location (city/state)
- Remote (remote/hybrid/onsite)
- Salary

Output JSON only: {"company":"X","position":"Y","status":"Z","location":"A","remote_status":"B","salary_range":"C"}
Use null for unknown.`,

  // Hermes models - function calling style
  'hermes-2-pro-mistral-7b-q5_k_m': `<function>extract_job_details</function>
<parameters>
Extract these fields from the email:
- company: string (required - extract from subject, sender domain, or body)
- position: string (job title/role)
- status: enum[Applied, Interview, Assessment, Offer, Rejected, Opportunity]
- location: string (city, state, country)
- remote_status: enum[remote, hybrid, onsite]
- salary_range: string (salary information)
</parameters>
<output>{"company":"...","position":"...","status":"...","location":"...","remote_status":"...","salary_range":"..."}</output>`,

  // Gemma model
  'gemma-2-2b-it-q5_k_m': `Job extraction task:
Input: Email subject and body
Output: JSON with company, position, status, location, remote_status, salary_range
Status values: Applied, Interview, Assessment, Offer, Rejected, Opportunity
Use null for missing fields.
JSON: {"company":"...","position":"...","status":"...","location":"...","remote_status":"...","salary_range":"..."}`
};

// Fallback patterns for regex-based extraction
const EXTRACTION_PATTERNS = {
  linkedin: {
    // "Your application to [POSITION] at [COMPANY]"
    applicationTo: /Your application to (.+?) at (.+?)$/i,
    // "Andrew, your application was sent to [COMPANY]"
    applicationSent: /your application was sent to (.+?)$/i,
    // "Your application was viewed by [COMPANY]"
    applicationViewed: /Your application was viewed by (.+?)$/i
  },
  status: {
    applied: /application (was |has been )?(sent|submitted|received)|thank you for applying/i,
    interview: /interview|phone screen|technical assessment|coding challenge/i,
    offer: /offer|congratulations|we are pleased/i,
    rejected: /unfortunately|not moving forward|decided to proceed with other/i,
    opportunity: /opportunity|opening|position available|we have a? role/i
  },
  remote: {
    remote: /\b(fully )?remote\b/i,
    hybrid: /\bhybrid\b/i,
    onsite: /\b(on-?site|in-?office|on campus)\b/i
  },
  salary: {
    range: /\$[\d,]+k?\s*[-–]\s*\$?[\d,]+k?|\$[\d,]+(?:,\d{3})*(?:\.\d{2})?/i
  }
};

// Helper function to extract company from email domain
function extractCompanyFromDomain(fromAddress) {
  const domainMatch = fromAddress.match(/@([^.]+)\./);
  if (domainMatch) {
    const domain = domainMatch[1];
    // Common ATS to company mappings
    const atsMapping = {
      'workday': 'extract from workday.notifications@[company].com',
      'greenhouse': 'extract from greenhouse',
      'lever': 'extract from lever',
      'taleo': 'extract from taleo'
    };
    
    // Check if it's Workday format: Workday.Notifications@company.com
    if (fromAddress.includes('Workday.Notifications@')) {
      const companyMatch = fromAddress.match(/@([^.]+)\./);
      if (companyMatch) {
        return companyMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
    }
    
    return domain.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  return null;
}

module.exports = {
  OPTIMIZED_EXTRACTION_PROMPTS,
  EXTRACTION_EXAMPLES,
  EXTRACTION_PATTERNS,
  extractCompanyFromDomain
};