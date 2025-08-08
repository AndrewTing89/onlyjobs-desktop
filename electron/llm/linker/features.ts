import crypto from "crypto";

export type EmailFeatures = {
  companyCanon: string;              // canonicalized company
  titleNorm?: string;                // may be undefined
  titleFP?: string;                  // fingerprint from title if present
  contentFP: string;                 // fingerprint for role-less emails
  atsPortal?: 'greenhouse'|'lever'|'workday'|'smartrecruiters'|'icims'|'bamboohr';
  atsJobId?: string;
  reqId?: string;
  threadId?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  participants: string[];            // domains
  messageDate: number;
};

// Normalize company name for canonical matching
export function canonicalizeCompany(company: string | null): string {
  if (!company) return "unknown";
  return company
    .toLowerCase()
    .replace(/\b(inc|corp|ltd|llc|co)\b\.?/g, "") // Remove common suffixes
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

// Normalize position title for fuzzy matching
export function normalizeTitle(title: string | null): string | undefined {
  if (!title) return undefined;
  
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ") // Keep hyphens, remove other punctuation
    .replace(/\b(the|and|or|at|in|for|with|of)\b/g, "") // Remove stopwords
    .replace(/–.*$/, "") // Remove everything after em-dash
    .replace(/\([^)]*\)/g, "") // Remove parenthetical content
    .replace(/\[[^\]]*\]/g, "") // Remove bracketed content
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

// Create fingerprint from title components
export function positionFingerprint(title?: string, location?: string, team?: string): string | undefined {
  if (!title) return undefined;
  
  const components = [
    normalizeTitle(title),
    location ? location.toLowerCase().trim() : null,
    team ? team.toLowerCase().trim() : null
  ].filter(Boolean);
  
  if (components.length === 0) return undefined;
  
  return crypto.createHash("sha1").update(components.join("|")).digest("hex").substring(0, 12);
}

// Create content fingerprint for emails without clear position
export function contentFingerprint(subject: string, bodyText: string): string {
  // Extract meaningful lines that might indicate the role
  const text = `${subject}\n${bodyText}`;
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 10) // Skip short lines
    .filter(line => /\b(application|interview|candidate|requisition|position|role|job|opportunity)\b/i.test(line))
    .slice(0, 20) // Take first 20 relevant lines
    .join(" ")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
    
  return crypto.createHash("sha1").update(text).digest("hex").substring(0, 12);
}

// Extract ATS job IDs from various platforms
export function extractATSInfo(subject: string, bodyText: string, fromEmail: string): {
  atsPortal?: EmailFeatures['atsPortal'];
  atsJobId?: string;
} {
  const text = `${subject}\n${bodyText}\n${fromEmail}`;
  
  // Greenhouse
  const greenhouseMatch = text.match(/greenhouse\.io\/(?:job|jobs)\/(\d+)/i);
  if (greenhouseMatch) {
    return { atsPortal: 'greenhouse', atsJobId: greenhouseMatch[1] };
  }
  
  // Lever
  const leverMatch = text.match(/jobs\.lever\.co\/[^\/]+\/([A-Za-z0-9-]+)/i);
  if (leverMatch) {
    return { atsPortal: 'lever', atsJobId: leverMatch[1] };
  }
  
  // Workday
  const workdayMatch = text.match(/workday[^?]*[?&](?:jobPostingId|jobId|positions?)=([\w-]+)/i);
  if (workdayMatch) {
    return { atsPortal: 'workday', atsJobId: workdayMatch[1] };
  }
  
  // SmartRecruiters
  const smartMatch = text.match(/smartrecruiters\.com\/.*\/jobs?\/([\w-]+)/i);
  if (smartMatch) {
    return { atsPortal: 'smartrecruiters', atsJobId: smartMatch[1] };
  }
  
  // iCIMS
  const icimsMatch = text.match(/icims\.com\/jobs\/(\d+)/i);
  if (icimsMatch) {
    return { atsPortal: 'icims', atsJobId: icimsMatch[1] };
  }
  
  // BambooHR
  const bambooMatch = text.match(/bamboohr\.com\/.*\/jobs\/view\.php\?id=(\d+)/i);
  if (bambooMatch) {
    return { atsPortal: 'bamboohr', atsJobId: bambooMatch[1] };
  }
  
  return {};
}

// Extract requisition IDs
export function extractReqId(subject: string, bodyText: string): string | undefined {
  const text = `${subject}\n${bodyText}`;
  const reqMatch = text.match(/\b(?:Req(?:uisition)?|JR|R)[-# ]?(\d{3,})\b/i);
  return reqMatch ? reqMatch[1] : undefined;
}

// Extract participant domains from email headers
export function extractParticipants(fromEmail: string, toEmails?: string[], ccEmails?: string[]): string[] {
  const emails = [fromEmail, ...(toEmails || []), ...(ccEmails || [])];
  const domains = new Set<string>();
  
  emails.forEach(email => {
    if (email) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (domain) domains.add(domain);
    }
  });
  
  return Array.from(domains);
}

// Extract Gmail thread/message info from headers
export function extractGmailInfo(headers: Array<{ name: string; value: string }>): {
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
} {
  const messageId = headers.find(h => h.name.toLowerCase() === 'message-id')?.value;
  const inReplyTo = headers.find(h => h.name.toLowerCase() === 'in-reply-to')?.value;
  const references = headers.find(h => h.name.toLowerCase() === 'references')?.value
    ?.split(/\s+/)
    .filter(ref => ref.trim().length > 0);
    
  return {
    messageId: messageId?.toLowerCase(),
    inReplyTo: inReplyTo?.toLowerCase(),
    references: references?.map(ref => ref.toLowerCase())
  };
}

// Calculate title similarity using Jaro-Winkler approximation
export function titleSimilarity(title1?: string, title2?: string): number {
  if (!title1 || !title2) return 0;
  
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;
  
  // Simple similarity based on common words and character overlap
  const words1 = new Set(norm1.split(/\s+/));
  const words2 = new Set(norm2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(word => words2.has(word)));
  const union = new Set([...words1, ...words2]);
  
  const wordSim = intersection.size / union.size;
  
  // Character overlap
  const chars1 = new Set(norm1.replace(/\s+/g, ''));
  const chars2 = new Set(norm2.replace(/\s+/g, ''));
  
  const charIntersection = new Set([...chars1].filter(char => chars2.has(char)));
  const charUnion = new Set([...chars1, ...chars2]);
  
  const charSim = charIntersection.size / charUnion.size;
  
  // Weighted average favoring word similarity
  return wordSim * 0.7 + charSim * 0.3;
}

// Main feature extraction function
export function extractEmailFeatures(
  company: string | null,
  position: string | null,
  subject: string,
  bodyText: string,
  fromEmail: string,
  headers: Array<{ name: string; value: string }>,
  threadId?: string,
  messageDate?: number,
  toEmails?: string[],
  ccEmails?: string[]
): EmailFeatures {
  const companyCanon = canonicalizeCompany(company);
  const titleNorm = normalizeTitle(position);
  const titleFP = positionFingerprint(position);
  const contentFP = contentFingerprint(subject, bodyText);
  
  const { atsPortal, atsJobId } = extractATSInfo(subject, bodyText, fromEmail);
  const reqId = extractReqId(subject, bodyText);
  const participants = extractParticipants(fromEmail, toEmails, ccEmails);
  const gmailInfo = extractGmailInfo(headers);
  
  return {
    companyCanon,
    titleNorm,
    titleFP,
    contentFP,
    atsPortal,
    atsJobId,
    reqId,
    threadId: threadId?.toLowerCase(),
    messageId: gmailInfo.messageId,
    inReplyTo: gmailInfo.inReplyTo,
    references: gmailInfo.references,
    participants,
    messageDate: messageDate || Date.now()
  };
}