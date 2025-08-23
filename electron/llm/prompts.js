"use strict";
/**
 * Optimized compact prompts for local LLM email classification.
 * Reduced token usage while maintaining accuracy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.userPrompt = exports.SYSTEM_PROMPT = void 0;

exports.SYSTEM_PROMPT = `
Extract job application status data.

TRUE = application confirmations, rejections, interviews, offers for jobs you applied to
FALSE = job ads, recommendations, newsletters

Company: hiring organization (not job boards)
Position: full job title with codes  
Status: Applied/Interview/Declined/Offer

JSON only: {"is_job_related":boolean,"company":string,"position":string,"status":"Applied"}
`.trim();

const FEWSHOTS = `
Subject: Application Confirmation
Body: We received your application for R123 Data Analyst.
{"is_job_related": true, "company": "Adobe", "position": "R123 Data Analyst", "status": "Applied"}

Subject: Your application  
Body: We regret to inform you we decided to pursue other candidates.
{"is_job_related": true, "company": "Netflix", "position": null, "status": "Declined"}
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