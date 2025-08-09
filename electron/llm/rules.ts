/**
 * Helper rules for email classification
 * Optional utilities for status detection and validation
 */

export const JOB_STATUS_KEYWORDS = {
  Applied: ['application received', 'thank you for applying', 'submitted successfully'],
  Interview: ['interview', 'schedule', 'meeting', 'phone screen', 'video call'],
  Declined: ['unfortunately', 'not selected', 'rejected', 'different direction'],
  Offer: ['offer', 'congratulations', 'pleased to extend', 'job offer']
};

export const COMPANY_EXTRACTORS = [
  /at\s+([A-Z][a-zA-Z\s&]{1,30}?)(?:\s|,|\.|$)/g,  // "at Company Name"
  /from\s+([A-Z][a-zA-Z\s&]{1,30}?)(?:\s|<|,|$)/g, // "from Company Name"
  /@([a-zA-Z0-9-]+)\./g  // Domain name fallback
];

export const POSITION_EXTRACTORS = [
  /(?:for|as|position|role)\s+(?:of\s+)?([a-zA-Z\s]{3,40}?)(?:\s+(?:at|with|position|role)|$)/gi,
  /(software|senior|junior|lead|principal|data|marketing|sales|product)\s+([a-zA-Z\s]{2,25})(?:\s+(?:engineer|developer|manager|analyst|scientist|specialist))/gi
];

/**
 * Detect likely job status from email content
 */
export function detectJobStatus(content: string): "Applied" | "Interview" | "Declined" | "Offer" | null {
  const lowerContent = content.toLowerCase();
  
  for (const [status, keywords] of Object.entries(JOB_STATUS_KEYWORDS)) {
    if (keywords.some(keyword => lowerContent.includes(keyword))) {
      return status as any;
    }
  }
  
  return null;
}

/**
 * Extract company name using various patterns
 */
export function extractCompanyName(content: string): string | null {
  for (const pattern of COMPANY_EXTRACTORS) {
    const matches = Array.from(content.matchAll(pattern));
    for (const match of matches) {
      const candidate = match[1]?.trim();
      if (candidate && candidate.length > 2 && candidate.length < 50) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Extract position title using various patterns
 */
export function extractPosition(content: string): string | null {
  for (const pattern of POSITION_EXTRACTORS) {
    const match = content.match(pattern);
    if (match) {
      const candidate = (match[1] || match[2])?.trim();
      if (candidate && candidate.length > 2 && candidate.length < 50) {
        return candidate;
      }
    }
  }
  return null;
}