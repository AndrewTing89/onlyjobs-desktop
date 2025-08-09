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
2) If it IS about jobs, pick EXACTLY one status (prefer the most advanced if multiple cues):
   Offer > Declined > Interview > Applied
   - Applied: application submitted/received/under review/thanks for applying.
   - Interview: phone/HR/technical screen, assessment/take-home, scheduling/reschedule, interview confirmation.
   - Declined: rejection/unsuccessful/no longer considered/closed.
   - Offer: offer/package/compensation/contract.
3) Extract company (real org name if clear) and position (job title) when obvious; else null.
4) confidence:
   - 0.9 for explicit phrases ("We received your application", "Interview invitation", "We regret to inform", "Offer letter").
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

EXAMPLE 6
Subject: Interview invitation — Backend Engineer
Body: We'd like to schedule a 45-minute technical screen next week.
JSON: {"is_job_related": true, "company": null, "position": "Backend Engineer", "status": "Interview", "confidence": 0.9}

EXAMPLE 7
Subject: Your application to Globex
Body: We regret to inform you we will not proceed with your candidacy.
JSON: {"is_job_related": true, "company": "Globex", "position": null, "status": "Declined", "confidence": 0.9}

EXAMPLE 8
Subject: Offer letter — Product Manager
Body: Attached is your offer package and compensation details.
JSON: {"is_job_related": true, "company": null, "position": "Product Manager", "status": "Offer", "confidence": 0.9}
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