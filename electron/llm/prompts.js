"use strict";
/**
 * Deterministic, compact prompts for local LLM email classification.
 * Strict JSON only; short few-shots tuned for 3B models.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.userPrompt = exports.SYSTEM_PROMPT = void 0;

exports.SYSTEM_PROMPT = `
You classify emails about job applications. Return ONLY a strict JSON object and nothing else.
No markdown, no commentary, no code fences.

Output JSON schema:
{
  "is_job_related": boolean,
  "company": string|null,
  "position": string|null,
  "status": "Applied"|"Interview"|"Declined"|"Offer"|null,
  "confidence": number  // 0..1
}

Decision rules:
1) If NOT about the job-application lifecycle → is_job_related=false; company=null; position=null; status=null; confidence<=0.4.
2) If it IS about jobs, pick EXACTLY one status (STRICT PRIORITY ORDER):
   Declined > Applied > Interview > Offer
   - Declined: rejection/unsuccessful/no longer considered/closed/"decided to pursue other candidates"/"more closely aligned with our needs".
   - Applied: application submitted/received/under review/thanks for applying/"successfully applied"/"have successfully applied"/"application has been received"/"eagerly reviewing".
   - Interview: phone/HR/technical screen, assessment/take-home, scheduling/reschedule, interview confirmation.
   - Offer: offer/package/compensation/contract (only if no rejection or application signals).
3) Extract company (real org name if clear) and position (job title) when obvious; else null.

   CRITICAL JOB BOARD PLATFORM DETECTION:
   - NEVER extract job board names as company (Indeed, LinkedIn, ZipRecruiter, Monster, Glassdoor, etc.)
   - Job boards are PLATFORMS, not employers - look for actual hiring company in email body
   - INDEED EMAILS: sender @indeed.com → extract actual company from body text patterns:
     * "[POSITION], [COMPANY] - [Location]" → extract COMPANY
     * "Application submitted, [POSITION], [COMPANY] - [Location]" → extract COMPANY
     * Look for company name after position in body content
   - OTHER JOB BOARDS: Apply same logic - platform ≠ employer

   CRITICAL POSITION EXTRACTION RULES:
   - AGGRESSIVE EXTRACTION: If ANY job title is mentioned ANYWHERE in the email, extract it. Never return null if a position is clearly stated.
   - BROAD PATTERN RECOGNITION: Look for job titles in ALL these patterns:
     * "application for [TITLE]" → extract TITLE
     * "applied to [TITLE]" → extract TITLE  
     * "applied to the [TITLE] role" → extract TITLE
     * "[TITLE] position" → extract TITLE
     * "[TITLE] opening" → extract TITLE
     * "for the [TITLE]" → extract TITLE
     * "role of [TITLE]" → extract TITLE
     * Subject line job titles → extract from subject
     * Any clear job title mention → extract it
   
   - POST-PROCESSING CLEANUP:
     * Remove job codes: R_123456, R157623, REQ123456, -25013397, etc.
     * Fix spacing: "Business Analysis -Specialist" → "Business Analysis - Specialist"
     * Handle missing spaces: "theAnalytics Developer" → "Analytics Developer"
     * Clean punctuation: "Analytics Developer II-" → "Analytics Developer II"
   
   - MANDATORY EXTRACTION: If email mentions ANY recognizable job title, position CANNOT be null.
   
4) confidence:
   - 0.9 for explicit phrases ("We received your application", "successfully applied", "Interview invitation", "We regret to inform", "decided to pursue other candidates", "Offer letter").
   - ~0.6 for partial/indirect cues.
   - <=0.4 if uncertain.
5) Output MUST be a single JSON object; no extra keys, no trailing commas.
`.trim();

const FEWSHOTS = `
EXAMPLE 1
Subject: Thank you for your application to Persona
Body: We received your application for the Customer Insights Analyst position.
JSON: {"is_job_related": true, "company": "Persona", "position": "Customer Insights Analyst", "status": "Applied", "confidence": 0.9}

EXAMPLE 2
Subject: Thank you for your application to Notion, Zicheng!
Body: Thank you for applying. If a fit for the Data Scientist, Product role, we'll reach out.
JSON: {"is_job_related": true, "company": "Notion", "position": "Data Scientist, Product", "status": "Applied", "confidence": 0.9}

EXAMPLE 3
Subject: Thank You for Applying! (Nerdy)
Body: Your application has been received. Our Talent Acquisition team will review your qualifications.
JSON: {"is_job_related": true, "company": "Nerdy", "position": null, "status": "Applied", "confidence": 0.85}

EXAMPLE 4
Subject: Ingram Micro Application Received for Health & Safety Data Analyst
Body: Congratulations! We received your application for Health & Safety Data Analyst at Ingram Micro.
JSON: {"is_job_related": true, "company": "Ingram Micro", "position": "Health & Safety Data Analyst", "status": "Applied", "confidence": 0.9}

EXAMPLE 5
Subject: Thank you for applying to National Information Solutions Cooperative (NISC)
Body: We have received your application for the Data Analyst opening and will review it.
JSON: {"is_job_related": true, "company": "NISC", "position": "Data Analyst", "status": "Applied", "confidence": 0.9}

EXAMPLE 6 (CRITICAL - Application Confirmation with Job Code)
Subject: Application Confirmation - Business Analysis - Specialist
Body: You have successfully applied to the Business Analysis -Specialist R_318659 role at Marsh McLennan.
JSON: {"is_job_related": true, "company": "Marsh McLennan", "position": "Business Analysis - Specialist", "status": "Applied", "confidence": 0.9}

EXAMPLE 7 (CRITICAL - Application Confirmation with Spacing Issues)
Subject: Your Application for Analytics Developer II- Healthcare-25013397
Body: We have received your application for theAnalytics Developer II- Healthcare position and we want to assure you that we are eagerly reviewing.
JSON: {"is_job_related": true, "company": null, "position": "Analytics Developer II- Healthcare", "status": "Applied", "confidence": 0.9}

EXAMPLE 8 (CRITICAL - Successfully Applied Pattern)
Subject: Application Status Update
Body: You have successfully applied for the Senior Software Engineer position. We'll review your qualifications.
JSON: {"is_job_related": true, "company": null, "position": "Senior Software Engineer", "status": "Applied", "confidence": 0.9}

EXAMPLE 9
Subject: Interview invitation — Backend Engineer
Body: We'd like to schedule a 45-minute technical screen next week.
JSON: {"is_job_related": true, "company": null, "position": "Backend Engineer", "status": "Interview", "confidence": 0.9}

EXAMPLE 10 (CRITICAL - Rejection Detection)
Subject: Your Application for Analytics Developer II- Healthcare-25013397
Body: While your experience and background are impressive, we have decided to pursue other candidates who are more closely aligned with our current needs.
JSON: {"is_job_related": true, "company": null, "position": "Analytics Developer II- Healthcare", "status": "Declined", "confidence": 0.9}

EXAMPLE 11
Subject: Your application to Globex
Body: We regret to inform you we will not proceed with your candidacy.
JSON: {"is_job_related": true, "company": "Globex", "position": null, "status": "Declined", "confidence": 0.9}

EXAMPLE 12
Subject: Offer letter — Product Manager
Body: Attached is your offer package and compensation details.
JSON: {"is_job_related": true, "company": null, "position": "Product Manager", "status": "Offer", "confidence": 0.9}

EXAMPLE 13 (CRITICAL - Adobe Case with Job Code Pattern)
Subject: Adobe Application Confirmation
Body: We wanted to let you know that we received your application for the R157623 BDR Insights Analyst role.
JSON: {"is_job_related": true, "company": "Adobe", "position": "BDR Insights Analyst", "status": "Applied", "confidence": 0.9}

EXAMPLE 14 (CRITICAL - Position Extraction from Subject)
Subject: Data Scientist Position - Application Received
Body: Thank you for your interest in our company.
JSON: {"is_job_related": true, "company": null, "position": "Data Scientist", "status": "Applied", "confidence": 0.9}

EXAMPLE 15 (CRITICAL - Multiple Position Formats)
Subject: Software Engineer III Opening
Body: Your application for the Software Engineer III role has been received.
JSON: {"is_job_related": true, "company": null, "position": "Software Engineer III", "status": "Applied", "confidence": 0.9}

EXAMPLE 16 (CRITICAL - Missing Space Handling)
Subject: Application Update
Body: We received your application for theProduct Manager position at our company.
JSON: {"is_job_related": true, "company": null, "position": "Product Manager", "status": "Applied", "confidence": 0.9}

EXAMPLE 17 (CRITICAL - Job Title with Punctuation)
Subject: UX Designer II- Remote Application
Body: Thank you for applying to the UX Designer II- Remote position.
JSON: {"is_job_related": true, "company": null, "position": "UX Designer II- Remote", "status": "Applied", "confidence": 0.9}

EXAMPLE 18 (CRITICAL - Indeed Job Board Email #1)
Subject: Indeed Application: Analyst, Data Strategy & Communication
Body: Application submitted, Analyst, Data Strategy & Communication, Visa - San Francisco, California
JSON: {"is_job_related": true, "company": "Visa", "position": "Analyst, Data Strategy & Communication", "status": "Applied", "confidence": 0.9}

EXAMPLE 19 (CRITICAL - Indeed Job Board Email #2)
Subject: Indeed Application: Consultant- Data Analyst
Body: Application submitted, Consultant- Data Analyst, Sia - San Francisco, California
JSON: {"is_job_related": true, "company": "Sia", "position": "Consultant- Data Analyst", "status": "Applied", "confidence": 0.9}

EXAMPLE 20 (CRITICAL - Indeed Job Board Email #3)
Subject: Indeed Application: Senior Software Engineer
Body: Application submitted, Senior Software Engineer, Microsoft - Seattle, Washington. Good luck with your application!
JSON: {"is_job_related": true, "company": "Microsoft", "position": "Senior Software Engineer", "status": "Applied", "confidence": 0.9}

EXAMPLE 21 (CRITICAL - LinkedIn Job Board Email)
Subject: You applied to Product Manager at Google
Body: Your application for Product Manager at Google has been submitted through LinkedIn.
JSON: {"is_job_related": true, "company": "Google", "position": "Product Manager", "status": "Applied", "confidence": 0.9}

EXAMPLE 22 (CRITICAL - ZipRecruiter Job Board Email)
Subject: Application Confirmation - Data Scientist
Body: You applied to Data Scientist at Netflix through ZipRecruiter. We'll notify you of any updates.
JSON: {"is_job_related": true, "company": "Netflix", "position": "Data Scientist", "status": "Applied", "confidence": 0.9}
`.trim();

function userPrompt(subject, plaintext) {
  return `
${FEWSHOTS}

NOW CLASSIFY THIS EMAIL.
Subject: ${subject}
Body:
${plaintext}

Return ONLY the JSON object:
`.trim();
}
exports.userPrompt = userPrompt;