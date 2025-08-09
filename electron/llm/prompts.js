"use strict";
/**
 * LLM prompt templates for deterministic email classification
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_PROMPT_TEMPLATE = exports.SYSTEM_PROMPT = void 0;

exports.SYSTEM_PROMPT = `You classify emails about job applications. Return ONLY strict JSON. No markdown, no commentary.

JSON schema:
{
  "is_job_related": boolean,
  "company": string|null,
  "position": string|null,
  "status": "Applied"|"Interview"|"Declined"|"Offer"|null,
  "confidence": number  // 0..1
}`;

function USER_PROMPT_TEMPLATE(subject, plaintext) {
  return `Subject: ${subject}

${plaintext}

Return ONLY the JSON object. If unsure, set null and/or confidence <= 0.5.`;
}
exports.USER_PROMPT_TEMPLATE = USER_PROMPT_TEMPLATE;