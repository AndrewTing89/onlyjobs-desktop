/**
 * LLM prompt templates for deterministic email classification
 */

export const SYSTEM_PROMPT = `You classify emails about job applications. Return ONLY strict JSON. No markdown, no commentary.

JSON schema:
{
  "is_job_related": boolean,
  "company": string|null,
  "position": string|null,
  "status": "Applied"|"Interview"|"Declined"|"Offer"|null,
  "confidence": number  // 0..1
}`;

export function USER_PROMPT_TEMPLATE(subject: string, plaintext: string): string {
  return `Subject: ${subject}

${plaintext}

Return ONLY the JSON object. If unsure, set null and/or confidence <= 0.5.`;
}