/**
 * Fallback rule-based classifier for when LLM is unavailable or too slow
 * Provides basic job email classification without LLM inference
 */

/**
 * Rule-based fallback classification
 * @param {Object} input - Email input
 * @param {string} input.subject - Email subject
 * @param {string} input.plaintext - Email content
 * @param {string} input.fromAddress - Email from address
 * @returns {Object} Classification result
 */
function classifyEmailWithRules(input) {
    const { subject = '', plaintext = '', fromAddress = '' } = input;
    const combined = `${subject} ${plaintext}`.toLowerCase();
    
    console.log('🔧 Using rule-based fallback classifier');
    
    // Job-related keywords (high confidence)
    const jobKeywords = [
        'application', 'interview', 'position', 'job', 'career', 'hiring',
        'resume', 'cv', 'candidate', 'recruitment', 'offer', 'role',
        'employment', 'opportunity', 'screening', 'onsite', 'phone screen'
    ];
    
    // Non-job keywords (newsletters, marketing)
    const nonJobKeywords = [
        'newsletter', 'unsubscribe', 'marketing', 'promotion', 'sale',
        'discount', 'webinar', 'event', 'conference', 'update',
        'announcement', 'news', 'blog', 'article'
    ];
    
    // Check for job-related content
    const hasJobKeywords = jobKeywords.some(keyword => combined.includes(keyword));
    const hasNonJobKeywords = nonJobKeywords.some(keyword => combined.includes(keyword));
    
    // Determine if job-related
    const is_job_related = hasJobKeywords && !hasNonJobKeywords;
    
    if (!is_job_related) {
        return {
            is_job_related: false,
            company: null,
            position: null,
            status: null,
            confidence: 0.7,
            decisionPath: 'rule_based_fallback_not_job'
        };
    }
    
    // Extract company from email domain or content
    let company = extractCompanyFromRules(subject, plaintext, fromAddress);
    
    // Extract position from subject/content
    let position = extractPositionFromRules(subject, plaintext);
    
    // Determine status
    let status = determineStatusFromRules(subject, plaintext);
    
    return {
        is_job_related: true,
        company,
        position,
        status,
        confidence: 0.6, // Lower confidence for rule-based
        decisionPath: 'rule_based_fallback_job_detected'
    };
}

/**
 * Extract company name using rules
 */
function extractCompanyFromRules(subject, plaintext, fromAddress) {
    // Try email domain first
    if (fromAddress) {
        const domain = fromAddress.match(/@([^.]+)\./);
        if (domain && domain[1]) {
            const companyFromDomain = domain[1];
            // Skip common job boards and email providers
            const skipDomains = ['indeed', 'linkedin', 'gmail', 'yahoo', 'outlook', 'hotmail'];
            if (!skipDomains.includes(companyFromDomain.toLowerCase())) {
                return capitalizeFirst(companyFromDomain);
            }
        }
    }
    
    // Try to extract from subject patterns
    const subjectPatterns = [
        /^(.+?)\s*[-:]\s*(?:job|position|application|interview)/i,
        /application at\s+(.+?)$/i,
        /position at\s+(.+?)$/i,
        /interview with\s+(.+?)$/i
    ];
    
    for (const pattern of subjectPatterns) {
        const match = subject.match(pattern);
        if (match && match[1]) {
            const company = match[1].trim();
            if (company.length > 1 && company.length < 50) {
                return company;
            }
        }
    }
    
    // Try to extract from plaintext patterns
    const textPatterns = [
        /thank you for applying to\s+(.+?)\s+for/i,
        /position at\s+(.+?)\s+/i,
        /join\s+(.+?)\s+as/i,
        /opportunity at\s+(.+?)\s+/i
    ];
    
    for (const pattern of textPatterns) {
        const match = plaintext.match(pattern);
        if (match && match[1]) {
            const company = match[1].trim();
            if (company.length > 1 && company.length < 50) {
                return company;
            }
        }
    }
    
    return null;
}

/**
 * Extract position/job title using rules
 */
function extractPositionFromRules(subject, plaintext) {
    // Try subject patterns first
    const subjectPatterns = [
        /application for\s+(.+?)$/i,
        /your application for\s+(.+?)$/i,
        /re:\s*(.+?)\s*[-–—]\s*application/i,
        /re:\s*(.+?)\s*application/i,
        /position:\s*(.+?)$/i,
        /role:\s*(.+?)$/i,
        /(.+?)\s*[-–—]\s*(?:application|interview|position)/i
    ];
    
    for (const pattern of subjectPatterns) {
        const match = subject.match(pattern);
        if (match && match[1]) {
            const position = match[1].trim();
            if (position.length > 2 && position.length < 100) {
                return cleanPositionTitle(position);
            }
        }
    }
    
    // Try plaintext patterns
    const textPatterns = [
        /applying for (?:the\s+)?(.+?)\s+position/i,
        /application for (?:the\s+)?(.+?)\s+role/i,
        /interested in (?:the\s+)?(.+?)\s+(?:position|role)/i
    ];
    
    for (const pattern of textPatterns) {
        const match = plaintext.match(pattern);
        if (match && match[1]) {
            const position = match[1].trim();
            if (position.length > 2 && position.length < 100) {
                return cleanPositionTitle(position);
            }
        }
    }
    
    return null;
}

/**
 * Determine application status using rules
 */
function determineStatusFromRules(subject, plaintext) {
    const combined = `${subject} ${plaintext}`.toLowerCase();
    
    // Priority order for status detection
    if (combined.includes('congratulations') || 
        combined.includes('job offer') || 
        combined.includes('we are pleased to offer') ||
        combined.includes('offer letter')) {
        return 'Offer';
    }
    
    if (combined.includes('interview') || 
        combined.includes('schedule a call') ||
        combined.includes('next step') ||
        combined.includes('phone screen') ||
        combined.includes('video call') ||
        combined.includes('zoom') ||
        combined.includes('meet with')) {
        return 'Interview';
    }
    
    if (combined.includes('unfortunately') || 
        combined.includes('not selected') ||
        combined.includes('decided not to proceed') ||
        combined.includes('other candidates') ||
        combined.includes('not moving forward') ||
        combined.includes('position has been filled')) {
        return 'Declined';
    }
    
    if (combined.includes('application received') || 
        combined.includes('thank you for applying') ||
        combined.includes('we have received your application') ||
        combined.includes('application submitted') ||
        combined.includes('your application') ||
        combined.includes('application confirmation')) {
        return 'Applied';
    }
    
    return 'Applied'; // Default status for job-related emails
}

/**
 * Clean position title helper
 */
function cleanPositionTitle(position) {
    if (!position || typeof position !== 'string') {
        return null;
    }
    
    let cleaned = position.trim();
    
    // Remove job codes and IDs
    cleaned = cleaned.replace(/\b[A-Z]_?\d{4,}\b/g, '');
    cleaned = cleaned.replace(/\b[A-Z]{2,}\d{4,}\b/g, '');
    cleaned = cleaned.replace(/-\d{6,}$/g, '');
    cleaned = cleaned.replace(/\(\d+\)$/g, '');
    
    // Clean up spaces and punctuation
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/^[\s\-]+|[\s\-]+$/g, '');
    cleaned = cleaned.replace(/\s*-\s*$/, '');
    
    return cleaned.length > 1 ? cleaned : null;
}

/**
 * Capitalize first letter helper
 */
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
    classifyEmailWithRules
};