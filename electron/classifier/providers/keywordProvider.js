/**
 * Keyword-based email classifier (fallback provider)
 * Uses simple pattern matching for job-related email detection
 */

const JOB_KEYWORDS = [
  'application', 'position', 'job', 'career', 'hiring', 'interview',
  'resume', 'cv', 'recruitment', 'vacancy', 'employment', 'opportunity',
  'candidate', 'apply', 'applicant', 'role', 'opening', 'talent'
];

const COMPANY_PATTERNS = [
  /from\s+(.+?)\s+</, // "from Company Name <email>"
  /(\w+\s+(?:inc|corp|ltd|llc|company))/gi,
  /@([^.]+)\./  // domain name as fallback
];

const POSITION_PATTERNS = [
  /(?:for|as|position|role)\s+(?:of\s+)?([a-z\s]{2,30}?)(?:\s+(?:at|with|position|role)|$)/gi,
  /(?:software|senior|junior|lead|principal)\s+([a-z\s]{2,20})(?:\s+(?:engineer|developer|manager))/gi
];

/**
 * Parse email content using keyword-based classification
 * @param {import('../index').ParseInput} input - Email content to classify
 * @returns {Promise<import('../index').ParseResult>} Classification result
 */
async function parse(input) {
  const { subject = '', plaintext = '' } = input;
  const combinedText = `${subject} ${plaintext}`.toLowerCase();
  
  // Check for job-related keywords
  const isJobRelated = JOB_KEYWORDS.some(keyword => 
    combinedText.includes(keyword)
  );
  
  // Extract company name
  let company = null;
  for (const pattern of COMPANY_PATTERNS) {
    const match = plaintext.match(pattern);
    if (match) {
      company = match[1]?.trim() || match[0]?.trim();
      if (company && company.length > 2 && company.length < 50) {
        company = company.replace(/[@<>]/g, '').trim();
        break;
      }
    }
  }
  
  // Extract position
  let position = null;
  for (const pattern of POSITION_PATTERNS) {
    const match = combinedText.match(pattern);
    if (match && match[1]) {
      position = match[1].trim();
      if (position.length > 2 && position.length < 50) {
        break;
      }
    }
  }
  
  // Determine status based on content patterns
  let status = null;
  if (isJobRelated) {
    const lowerContent = combinedText;
    if (lowerContent.includes('interview') || lowerContent.includes('schedule')) {
      status = 'Interview';
    } else if (lowerContent.includes('offer') || lowerContent.includes('congratulations')) {
      status = 'Offer';
    } else if (lowerContent.includes('reject') || lowerContent.includes('unfortunately')) {
      status = 'Declined';
    } else {
      status = 'Applied';
    }
  }
  
  return {
    is_job_related: isJobRelated,
    company,
    position,
    status,
    confidence: isJobRelated ? 0.6 : 0.3 // Simple confidence scoring
  };
}

module.exports = { parse };