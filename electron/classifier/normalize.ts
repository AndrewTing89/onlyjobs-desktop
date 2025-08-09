/**
 * Post-processing normalization layer for job application extraction
 * Prefers SUBJECT over BODY, applies vendor-specific heuristics, cleans fragments
 */

export interface NormalizeInput {
  subject: string;
  plaintext: string;
  fromAddress?: string;
}

export interface LLMResult {
  is_job_related: boolean;
  company: string | null;
  position: string | null;
  status: 'Applied' | 'Interview' | 'Declined' | 'Offer' | null;
  confidence: number;
  decisionPath?: string;
}

export interface NormalizedResult {
  is_job_related: boolean;
  company: string | null;
  position: string | null;
  status: 'Applied' | 'Interview' | 'Declined' | 'Offer' | null;
  confidence: number;
  decisionPath?: string;
  notes?: string[];
}

function safeTrim(str: string | null | undefined): string {
  return (str || '').trim();
}

function parseFrom(fromAddress: string): { fromDisplay: string; fromEmail: string } {
  if (!fromAddress) return { fromDisplay: '', fromEmail: '' };
  
  // Extract from "Display Name <email@domain.com>" or just "email@domain.com"
  const match = fromAddress.match(/^(.+?)\s*<([^>]+)>$/) || fromAddress.match(/^([^<]*?)(\S+@\S+)$/);
  if (match) {
    return {
      fromDisplay: safeTrim(match[1]).replace(/^["']|["']$/g, ''), // Remove quotes
      fromEmail: safeTrim(match[2])
    };
  }
  
  // Fallback: treat entire string as email if it contains @
  if (fromAddress.includes('@')) {
    return { fromDisplay: '', fromEmail: safeTrim(fromAddress) };
  }
  
  return { fromDisplay: safeTrim(fromAddress), fromEmail: '' };
}

function titleCase(str: string): string {
  return str.replace(/\b\w+/g, (word) => {
    if (['of', 'and', 'the', 'in', 'at', 'for', 'to', 'a', 'an'].includes(word.toLowerCase()) && word !== str.split(' ')[0]) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function companySanitize(str: string | null): string | null {
  if (!str) return null;
  
  let cleaned = str.trim();
  
  // Strip leading determiners
  cleaned = cleaned.replace(/^(the|our|a|an)\s+/i, '');
  
  // Remove common phrases
  cleaned = cleaned.replace(/(thank you.*|your application.*|we (have )?received.*|we are excited.*)/gi, '');
  
  // Remove anything after first sentence end
  cleaned = cleaned.replace(/[.!?]\s.*/, '');
  
  // Remove trailing punctuation and whitespace
  cleaned = cleaned.replace(/[.,;:!\-–—]+$/, '').trim();
  
  // Reject if contains @ or obvious garbage
  if (cleaned.includes('@') || cleaned.length > 40 || /application|received|thank/i.test(cleaned)) {
    return null;
  }
  
  cleaned = titleCase(cleaned);
  
  // Limit to 5 words
  const words = cleaned.split(/\s+/).slice(0, 5);
  
  // Reject if all stopwords
  const stopwords = ['the', 'and', 'of', 'to', 'for', 'in', 'at', 'with', 'by'];
  if (words.every(word => stopwords.includes(word.toLowerCase()))) {
    return null;
  }
  
  return words.join(' ').trim() || null;
}

function positionSanitize(str: string | null): string | null {
  if (!str) return null;
  
  let cleaned = str.trim();
  
  // Remove common phrases
  cleaned = cleaned.replace(/(thank you.*|your application.*|we (have )?received.*|application.*for.*)/gi, '');
  
  // Remove anything after punctuation
  cleaned = cleaned.replace(/[.!?].*/, '');
  
  // Remove trailing "at X", "with Y" clauses
  cleaned = cleaned.replace(/\s+(at|with|for)\s+.*/i, '');
  
  cleaned = titleCase(cleaned.trim());
  
  // Limit to 6 words
  const words = cleaned.split(/\s+/).slice(0, 6);
  
  if (!words.length || words.every(word => word.length < 2)) {
    return null;
  }
  
  return words.join(' ').trim() || null;
}

export function normalizeResult(input: NormalizeInput, llm: LLMResult): NormalizedResult {
  const subject = safeTrim(input.subject);
  const body = safeTrim(input.plaintext);
  const { fromDisplay, fromEmail } = parseFrom(input.fromAddress || '');
  const domain = fromEmail.split('@')[1] || '';
  
  const notes: string[] = [];
  let result: NormalizedResult = {
    is_job_related: llm.is_job_related,
    company: llm.company,
    position: llm.position,
    status: llm.status,
    confidence: llm.confidence,
    decisionPath: llm.decisionPath,
    notes: []
  };
  
  // Vendor detection
  const isGreenhouse = /greenhouse-mail\.io$/i.test(domain);
  const isWorkday = /(^|\.)myworkday\.com$/i.test(domain) || /@otp\.workday\.com$/i.test(fromEmail);
  const isAshby = /@ashbyhq\.com$/i.test(fromEmail);
  const isSuccessFactors = /successfactors\.com|sap\.com/i.test(domain);
  const isLever = /jobs\.lever\.co/i.test(body) || /@hire.lever.co/i.test(fromEmail);
  
  // Non-job demoters (early exit)
  if (/(billpay|billing|invoice|statement|payment)/i.test(domain) && 
      !/\b(job|application|applied|interview|offer|candidate|position|role)\b/i.test(subject)) {
    return {
      is_job_related: false,
      company: null,
      position: null,
      status: null,
      confidence: 0.2,
      decisionPath: (llm.decisionPath || '') + '_demote_billing_domain',
      notes: ['demoted_billing_domain']
    };
  }
  
  // Strong subject cues for status override (priority: Offer > Declined > Interview > Applied)
  let statusFromSubject: string | null = null;
  if (/\b(offer|congratulations|we are pleased to offer)\b/i.test(subject)) {
    statusFromSubject = 'Offer';
  } else if (/\b(regret|unfortunately|will not proceed|not move forward|not selected)\b/i.test(subject)) {
    statusFromSubject = 'Declined';
  } else if (/\b(interview|screen|phone screen|onsite|schedule|assessment|coding test)\b/i.test(subject)) {
    statusFromSubject = 'Interview';
  } else if (/\b(thank you for applying|application received|we received your application)\b/i.test(subject)) {
    statusFromSubject = 'Applied';
  }
  
  if (statusFromSubject && statusFromSubject !== llm.status) {
    result.status = statusFromSubject as any;
    result.confidence = Math.max(llm.confidence, 0.7);
    notes.push('status_subject_override');
  }
  
  // Company extraction (subject-first, then vendor-specific)
  let candidateCompany = llm.company || '';
  
  // Subject patterns  
  const companyPatterns = [
    /thank you for (your )?application to ([^,–\-|.!?]{2,50})/i,
    /your application to ([^,–\-|.!?]{2,50})/i, 
    /application received .* at ([^,–\-|.!?]{2,50})/i,
    /application .* for .* at ([^,–\-|.!?]{2,50})/i,
    /received .* application .* at ([^,–\-|.!?]{2,50})/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\.\s+/i  // "Extend. Your application..." pattern
  ];
  
  for (const pattern of companyPatterns) {
    const match = subject.match(pattern);
    if (match) {
      const extracted = match[match.length - 1]; // Last capture group
      if (extracted && extracted.length > 1 && extracted.length < 50) {
        candidateCompany = extracted.trim();
        notes.push('company_from_subject');
        break;
      }
    }
  }
  
  // Vendor-specific company extraction
  if (!candidateCompany && isWorkday) {
    // Extract from email like "gapinc@myworkday.com" -> "Gap Inc"
    const workdayMatch = fromEmail.match(/(.+?)@myworkday\.com/);
    if (workdayMatch) {
      candidateCompany = titleCase(workdayMatch[1].replace(/([a-z])([A-Z])/g, '$1 $2'));
      notes.push('company_from_workday_email');
    }
    
    // Also try subject pattern like "Workday @ IngramMicro"
    const workdaySubject = subject.match(/workday\s*@\s*([A-Za-z0-9&\.\- ]{2,40})/i);
    if (workdaySubject) {
      candidateCompany = workdaySubject[1].replace(/([a-z])([A-Z])/g, '$1 $2').trim();
      notes.push('company_from_workday_subject');
    }
  }
  
  if (!candidateCompany && isGreenhouse) {
    // Look for company in subject or body "Thank you for applying to X"
    const ghMatch = (subject + ' ' + body).match(/thank you for applying to ([^,–\-|.!?]{2,40})/i);
    if (ghMatch) {
      candidateCompany = ghMatch[1].trim();
      notes.push('company_from_greenhouse');
    }
  }
  
  if (!candidateCompany && isAshby) {
    // Extract from display name like "Persona Talent Team"
    if (fromDisplay) {
      const cleanedDisplay = fromDisplay.replace(/(talent team|recruiting|careers|hr team)$/i, '').trim();
      const words = cleanedDisplay.split(/\s+/);
      if (words.length > 0 && words[0].length > 1) {
        candidateCompany = words.slice(0, 2).join(' ');  // Take first 1-2 words
        notes.push('company_from_ashby_display');
      }
    }
  }
  
  // Fallback: derive from fromDisplay or domain
  if (!candidateCompany) {
    if (fromDisplay) {
      candidateCompany = fromDisplay
        .replace(/(talent team|recruiting|careers|hr team|inc\.?|corp\.?|llc\.?)$/i, '')
        .trim();
      if (candidateCompany.length > 2) {
        notes.push('company_from_display_fallback');
      }
    } else if (fromEmail && !/(gmail|yahoo|outlook|hotmail|applytojob|greenhouse|ashby|workday)/.test(fromEmail)) {
      // Extract from domain like "no-reply@lucidmotors.com" -> "Lucid Motors"
      const domainParts = domain.split('.');
      if (domainParts.length >= 2 && domainParts[0].length > 2) {
        candidateCompany = domainParts[0]
          .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase to space
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        notes.push('company_from_domain');
      }
    }
  }
  
  // Position extraction (subject-first)
  let candidatePosition = llm.position || '';
  
  const positionPatterns = [
    /for (the )?(.+?) (position|role)(\s|$)/i,  
    /(position|role):\s*([A-Za-z0-9\/&\-\+\(\) ]{2,80})/i,
    /received .* application .* for ([A-Za-z0-9\/&\-\+\(\) ]{2,80})(\s+(at|with|position|role)|$)/i,
    /application .* for ([A-Za-z0-9\/&\-\+\(\) ]{2,80}) (at|with)/i,
    /we.*received your application for ([A-Za-z0-9\/&\-\+\(\) ]{2,80})(\s|$)/i,
    /offer for ([A-Za-z0-9\/&\-\+\(\) ]{2,80}) (position|role|at|$)/i,
    /invitation.*for ([A-Za-z0-9\/&\-\+\(\) ]{2,80})(\s|$)/i,
    /(Data|Machine|Business|Product|Software|Full Stack|Backend|Frontend|Analyst|Scientist|Engineer|Manager|Developer|Designer|Specialist|Associate|Coordinator)[A-Za-z0-9\/&\-\+\(\) ]{0,60}(position|role|$)/i
  ];
  
  for (const pattern of positionPatterns) {
    const match = subject.match(pattern);
    if (match) {
      // Find the right capture group - usually index 1 or 2
      let extracted = '';
      for (let i = 1; i < match.length; i++) {
        const candidate = match[i];
        if (candidate && candidate.length > 2 && candidate.length < 100 && 
            !/^(the|a|an|at|with|for|position|role|$)$/i.test(candidate.trim())) {
          extracted = candidate.trim();
          break;
        }
      }
      
      if (extracted) {
        candidatePosition = extracted;
        notes.push('position_from_subject');
        break;
      }
    }
  }
  
  // Body fallback for position
  if (!candidatePosition) {
    const bodyLines = body.split('\n').slice(0, 10); // First 10 lines
    for (const line of bodyLines) {
      const match = line.match(/(position|role):\s*([A-Za-z0-9\/&\-\+\(\) ]{2,80})/i);
      if (match) {
        candidatePosition = match[2].trim();
        notes.push('position_from_body');
        break;
      }
    }
  }
  
  // Final sanitization and assignment
  result.company = companySanitize(candidateCompany);
  result.position = positionSanitize(candidatePosition);
  
  // Override confidence if we made significant changes
  if (notes.some(note => note.includes('subject') || note.includes('workday') || note.includes('greenhouse'))) {
    result.confidence = Math.max(llm.confidence, 0.8);
  }
  
  // Add normalization note to decision path
  if (notes.length > 0) {
    result.decisionPath = (llm.decisionPath || '') + '_normalized';
  }
  
  result.notes = notes.length > 0 ? notes : undefined;
  
  return result;
}