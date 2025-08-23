"use strict";

/**
 * Enhanced Fallback System for Gmail Email Classification
 * Provides robust rule-based classification when LLM fails/times out
 */

const { getGlobalMonitor } = require('./production-monitor');

class EnhancedFallbackSystem {
    constructor() {
        this.productionMonitor = getGlobalMonitor();
        
        // Rule-based patterns optimized for Gmail
        this.gmailPatterns = {
            // ATS system patterns (job-related)
            ats: {
                domains: [
                    '@greenhouse.io', '@workday.com', '@lever.co', '@bamboohr.com',
                    '@icims.com', '@smartrecruiters.com', '@taleo.net', 
                    '@successfactors.com', '@myworkday.com', '@workdayrecruiting.com'
                ],
                subjects: [
                    /application.*received/i, /application.*confirmation/i,
                    /thank.*you.*for.*applying/i, /thanks.*for.*applying/i,
                    /your.*application/i, /application.*status/i
                ],
                bodies: [
                    /application.*received/i, /thank.*you.*for.*applying/i,
                    /application.*has.*been.*received/i, /we.*have.*received.*your.*application/i
                ]
            },
            
            // Job rejection patterns (job-related)
            rejections: {
                subjects: [
                    /update.*on.*your.*application/i, /regarding.*your.*application/i,
                    /application.*status/i, /position.*update/i,
                    /thank.*you.*for.*your.*interest/i
                ],
                bodies: [
                    /unfortunately/i, /regret.*to.*inform/i, /sorry.*to.*inform/i,
                    /not.*selected/i, /other.*candidates/i, /different.*direction/i,
                    /position.*has.*been.*filled/i, /decided.*to.*move.*forward.*with/i,
                    /will.*not.*be.*moving.*forward/i, /pursuing.*other.*candidates/i,
                    /not.*be.*progressing/i, /thank.*you.*for.*your.*interest.*however/i
                ]
            },
            
            // Interview patterns (job-related)
            interviews: {
                subjects: [
                    /interview.*invitation/i, /interview.*request/i, /schedule.*interview/i,
                    /phone.*screen/i, /technical.*interview/i, /next.*steps/i
                ],
                bodies: [
                    /interview/i, /schedule/i, /phone.*screen/i, /video.*call/i,
                    /technical.*screen/i, /hiring.*manager/i, /next.*steps/i,
                    /would.*like.*to.*schedule/i, /invite.*you.*for/i
                ]
            },
            
            // Job offer patterns (job-related)
            offers: {
                subjects: [
                    /job.*offer/i, /offer.*letter/i, /congratulations/i,
                    /welcome.*to.*the.*team/i, /pleased.*to.*offer/i
                ],
                bodies: [
                    /pleased.*to.*offer/i, /job.*offer/i, /offer.*letter/i,
                    /congratulations/i, /welcome.*to/i, /compensation.*package/i,
                    /extend.*an.*offer/i, /offer.*you.*the.*position/i
                ]
            },
            
            // Job board alerts (NOT job-related)
            jobBoards: {
                domains: [
                    '@indeed.com', '@linkedin.com', '@glassdoor.com',
                    '@ziprecruiter.com', '@monster.com', '@careerbuilder.com',
                    '@dice.com'
                ],
                subjects: [
                    /your.*job.*alert/i, /job.*alert/i, /jobs.*recommended/i,
                    /recommended.*for.*you/i, /new.*jobs.*matching/i,
                    /\d+.*new.*jobs/i, /jobs.*you.*might.*like/i
                ],
                bodies: [
                    /job.*alert/i, /recommended.*jobs/i, /jobs.*matching/i,
                    /new.*jobs.*for/i, /jobs.*you.*might.*be.*interested/i,
                    /view.*all.*jobs/i, /manage.*your.*job.*alerts/i,
                    /you.*have.*job.*alerts.*turned.*on/i
                ]
            },
            
            // Talent community (NOT job-related)
            talentCommunity: {
                subjects: [
                    /talent.*community/i, /joined.*talent.*community/i,
                    /welcome.*to.*talent/i
                ],
                bodies: [
                    /talent.*community/i, /talent.*pool/i, /talent.*network/i,
                    /joined.*the.*talent/i, /you.*will.*receive.*these.*messages/i,
                    /every.*\d+.*days/i, /weekly.*opportunities/i,
                    /member.*of.*our.*talent/i
                ]
            }
        };
        
        // Common company domain mappings
        this.companyDomainMappings = {
            'google.com': 'Google',
            'meta.com': 'Meta',
            'facebook.com': 'Meta',
            'microsoft.com': 'Microsoft',
            'apple.com': 'Apple',
            'amazon.com': 'Amazon',
            'netflix.com': 'Netflix',
            'spotify.com': 'Spotify',
            'uber.com': 'Uber',
            'airbnb.com': 'Airbnb',
            'stripe.com': 'Stripe',
            'tesla.com': 'Tesla',
            'adobe.com': 'Adobe'
        };
    }

    /**
     * Main fallback classification method
     * @param {Object} emailContext - Email context with subject, from, plaintext
     * @param {string} fallbackReason - Reason for using fallback
     * @returns {Object} Classification result
     */
    classifyWithFallback(emailContext, fallbackReason = 'llm-timeout') {
        console.log(`🔄 Using enhanced fallback classification (reason: ${fallbackReason})`);
        
        const { subject = '', from = '', plaintext = '' } = emailContext;
        
        // Record fallback usage
        this.productionMonitor.recordFallback(fallbackReason, emailContext);
        
        // Step 1: Check for obvious non-job-related patterns
        if (this.isJobBoardAlert(subject, from, plaintext)) {
            return {
                is_job_related: false,
                manual_record_risk: 'none',
                fallback_reason: fallbackReason,
                fallback_confidence: 'high'
            };
        }
        
        if (this.isTalentCommunity(subject, from, plaintext)) {
            return {
                is_job_related: false,
                manual_record_risk: 'none',
                fallback_reason: fallbackReason,
                fallback_confidence: 'high'
            };
        }
        
        // Step 2: Check for job-related patterns
        if (this.isAtsEmail(from)) {
            // ATS emails are almost always job-related
            return {
                is_job_related: true,
                manual_record_risk: 'low',
                fallback_reason: fallbackReason,
                fallback_confidence: 'high'
            };
        }
        
        if (this.isRejectionEmail(subject, plaintext)) {
            return {
                is_job_related: true,
                manual_record_risk: 'low',
                fallback_reason: fallbackReason,
                fallback_confidence: 'high'
            };
        }
        
        if (this.isInterviewEmail(subject, plaintext)) {
            return {
                is_job_related: true,
                manual_record_risk: 'low',
                fallback_reason: fallbackReason,
                fallback_confidence: 'high'
            };
        }
        
        if (this.isOfferEmail(subject, plaintext)) {
            return {
                is_job_related: true,
                manual_record_risk: 'low',
                fallback_reason: fallbackReason,
                fallback_confidence: 'high'
            };
        }
        
        // Step 3: Check for application confirmation patterns
        if (this.isApplicationConfirmation(subject, plaintext)) {
            return {
                is_job_related: true,
                manual_record_risk: 'medium',
                fallback_reason: fallbackReason,
                fallback_confidence: 'medium'
            };
        }
        
        // Step 4: Default to conservative classification
        // If we can't determine with confidence, assume not job-related
        // but flag for manual review
        return {
            is_job_related: false,
            manual_record_risk: 'high',
            fallback_reason: fallbackReason,
            fallback_confidence: 'low'
        };
    }

    /**
     * Enhanced job email parsing with fallback
     * @param {Object} emailContext - Email context
     * @param {string} fallbackReason - Reason for fallback
     * @returns {Object} Parsing result
     */
    parseWithFallback(emailContext, fallbackReason = 'llm-timeout') {
        console.log(`🔄 Using enhanced fallback parsing (reason: ${fallbackReason})`);
        
        const { subject = '', from = '', plaintext = '' } = emailContext;
        
        // Extract company
        const company = this.extractCompanyName(from, subject, plaintext);
        
        // Extract position
        const position = this.extractJobTitle(subject, plaintext);
        
        // Determine status
        const status = this.determineJobStatus(subject, plaintext);
        
        const result = {
            company,
            position,
            status,
            fallback_reason: fallbackReason,
            fallback_confidence: this.calculateParsingConfidence(company, position, status)
        };
        
        console.log(`🔄 Fallback parsing result:`, result);
        return result;
    }

    // Pattern detection methods
    isJobBoardAlert(subject, from, plaintext) {
        // Check domain
        const fromLower = from.toLowerCase();
        if (this.gmailPatterns.jobBoards.domains.some(domain => fromLower.includes(domain))) {
            return true;
        }
        
        // Check subject patterns
        const subjectLower = subject.toLowerCase();
        if (this.gmailPatterns.jobBoards.subjects.some(pattern => pattern.test(subject))) {
            return true;
        }
        
        // Check body patterns
        if (this.gmailPatterns.jobBoards.bodies.some(pattern => pattern.test(plaintext))) {
            return true;
        }
        
        return false;
    }

    isTalentCommunity(subject, from, plaintext) {
        // Check subject patterns
        if (this.gmailPatterns.talentCommunity.subjects.some(pattern => pattern.test(subject))) {
            return true;
        }
        
        // Check body patterns
        if (this.gmailPatterns.talentCommunity.bodies.some(pattern => pattern.test(plaintext))) {
            return true;
        }
        
        return false;
    }

    isAtsEmail(from) {
        const fromLower = from.toLowerCase();
        return this.gmailPatterns.ats.domains.some(domain => fromLower.includes(domain));
    }

    isRejectionEmail(subject, plaintext) {
        // Check subject patterns
        if (this.gmailPatterns.rejections.subjects.some(pattern => pattern.test(subject))) {
            // Confirm with body patterns
            return this.gmailPatterns.rejections.bodies.some(pattern => pattern.test(plaintext));
        }
        
        // Check body patterns directly (rejection words are strong indicators)
        return this.gmailPatterns.rejections.bodies.some(pattern => pattern.test(plaintext));
    }

    isInterviewEmail(subject, plaintext) {
        // Check subject patterns
        if (this.gmailPatterns.interviews.subjects.some(pattern => pattern.test(subject))) {
            return true;
        }
        
        // Check body patterns
        return this.gmailPatterns.interviews.bodies.some(pattern => pattern.test(plaintext));
    }

    isOfferEmail(subject, plaintext) {
        // Check subject patterns
        if (this.gmailPatterns.offers.subjects.some(pattern => pattern.test(subject))) {
            return true;
        }
        
        // Check body patterns
        return this.gmailPatterns.offers.bodies.some(pattern => pattern.test(plaintext));
    }

    isApplicationConfirmation(subject, plaintext) {
        // Check subject patterns
        if (this.gmailPatterns.ats.subjects.some(pattern => pattern.test(subject))) {
            return true;
        }
        
        // Check body patterns
        return this.gmailPatterns.ats.bodies.some(pattern => pattern.test(plaintext));
    }

    // Company extraction methods
    extractCompanyName(from, subject, plaintext) {
        // Method 1: Extract from known company domains
        const fromLower = from.toLowerCase();
        const domainMatch = fromLower.match(/@([^.]+)\./);
        if (domainMatch) {
            const domain = domainMatch[1];
            if (this.companyDomainMappings[`${domain}.com`]) {
                return this.companyDomainMappings[`${domain}.com`];
            }
        }
        
        // Method 2: Extract from ATS emails using "at [Company]" pattern
        if (this.isAtsEmail(from)) {
            const atPatterns = [
                /(?:position |role |application |job )at ([A-Z][A-Za-z\s&,.-]+?)(?:\s|\.|\,|\n|$)/gi,
                /at ([A-Z][A-Za-z\s&,.-]+?) (?:has|team|is|position)/gi,
                /([A-Z][A-Za-z\s&,.-]+?) (?:hiring|recruiting|talent) team/gi
            ];
            
            const textToSearch = `${subject} ${plaintext}`;
            for (const pattern of atPatterns) {
                const matches = textToSearch.matchAll(pattern);
                for (const match of matches) {
                    const candidate = match[1]?.trim();
                    if (candidate && candidate.length > 2 && candidate.length < 50) {
                        return this.normalizeCompanyName(candidate);
                    }
                }
            }
        }
        
        // Method 3: Extract from subject line
        const subjectCompanyPatterns = [
            /^([A-Z][A-Za-z\s&,.-]+?) (?:Application|Interview|Offer)/i,
            /(?:Application|Interview|Offer).*- ([A-Z][A-Za-z\s&,.-]+?)$/i
        ];
        
        for (const pattern of subjectCompanyPatterns) {
            const match = subject.match(pattern);
            if (match && match[1]) {
                const candidate = match[1].trim();
                if (candidate.length > 2 && candidate.length < 50) {
                    return this.normalizeCompanyName(candidate);
                }
            }
        }
        
        return null;
    }

    extractJobTitle(subject, plaintext) {
        // For complex cases with employment details, prioritize body text
        const hasComplexPattern = /(?:FT|PT|Full-?time|Part-?time|Contract).*?(?:Remote|On-?site|Hybrid).*?\([^)]*\d[^)]*\)/i.test(plaintext);
        
        if (hasComplexPattern) {
            // Method 1: Extract from plaintext first for complex cases
            const bodyResult = this.extractFromBodyText(plaintext);
            if (bodyResult) return bodyResult;
            
            // Fallback to subject if body extraction fails
            const subjectResult = this.extractFromSubject(subject);
            if (subjectResult) return subjectResult;
        } else {
            // Method 1: Extract from subject line first (most reliable for simple cases)
            const subjectResult = this.extractFromSubject(subject);
            if (subjectResult) return subjectResult;
            
            // Method 2: Extract from plaintext
            const bodyResult = this.extractFromBodyText(plaintext);
            if (bodyResult) return bodyResult;
        }
        
        return null;
    }
    
    extractFromSubject(subject) {
        const subjectPatterns = [
            /(?:for|-)\s*(.+?)\s*(?:position|role|job|at|\(|$)/i,
            /(?:application|interview|offer).*?(?:for|-)\s*(.+?)\s*(?:at|with|\(|$)/i,
            /^(.+?)\s*(?:-|\||at|with|job|position|role)/i
        ];
        
        for (const pattern of subjectPatterns) {
            const match = subject.match(pattern);
            if (match && match[1]) {
                const candidate = this.normalizeJobTitle(match[1]);
                if (candidate) return candidate;
            }
        }
        return null;
    }
    
    extractFromBodyText(plaintext) {
        const bodyPatterns = [
            // Match complex job titles with employment details - specific pattern for complex cases
            /(?:Your application for|application for|applying for|applied for)\s+(.+?)\s+-\s*(?:FT|PT|Full-?time|Part-?time|Contract)\s*(?:-\s*(?:Day|Night|Evening))?\s*(?:-\s*(?:Remote|On-?site|Hybrid))?\s*(?:\([^)]*\))?\s*(?:at|with)/gi,
            // Simpler patterns for standard cases
            /(?:application for|applying for|applied for)\s*(?:the\s*)?(.+?)\s*(?:at|with|has|\.|$)/gi,
            /your application for\s*(?:the\s*)?(.+?)\s*(?:at|with|has|\.|$)/gi,
            /(?:position|role|job)\s*:?\s*(.+?)(?:\n|\.|,|\()/gi,
            /(.+?)\s*position(?:\s*at|\s*with|$)/gi
        ];
        
        for (const pattern of bodyPatterns) {
            const matches = plaintext.matchAll(pattern);
            for (const match of matches) {
                const candidate = this.normalizeJobTitle(match[1]);
                if (candidate) return candidate;
            }
        }
        
        return null;
    }

    determineJobStatus(subject, plaintext) {
        const text = `${subject} ${plaintext}`.toLowerCase();
        
        // Check for rejection patterns
        if (this.gmailPatterns.rejections.bodies.some(pattern => pattern.test(text))) {
            return 'Declined';
        }
        
        // Check for offer patterns
        if (this.gmailPatterns.offers.bodies.some(pattern => pattern.test(text))) {
            return 'Offer';
        }
        
        // Check for interview patterns
        if (this.gmailPatterns.interviews.bodies.some(pattern => pattern.test(text))) {
            return 'Interview';
        }
        
        // Check for application patterns
        if (this.gmailPatterns.ats.bodies.some(pattern => pattern.test(text))) {
            return 'Applied';
        }
        
        return null;
    }

    // Normalization helpers
    normalizeCompanyName(company) {
        if (!company) return null;
        
        let normalized = company.trim()
            .replace(/^(The\\s+)/i, '')
            .replace(/\s+(Inc\.?|LLC|Corp\.?|Corporation|Ltd\.?|Company|Companies|Co\.?)$/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (normalized.length < 2 || normalized.length > 100) {
            return null;
        }
        
        return normalized;
    }

    normalizeJobTitle(title) {
        if (!title) return null;
        
        let normalized = title.trim()
            // Remove job codes
            .replace(/\b[A-Z]*\d+[A-Z]*\w*\b/g, '')
            .replace(/\([^)]*\d[^)]*\)/g, '')
            // Remove employment details
            .replace(/\s*-\s*(?:FT|PT|Full-?time|Part-?time|Contract|Remote|On-?site|Hybrid|Day|Night|Evening|Weekend)(?:\s*-\s*|\s|$)/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (normalized.length < 3 || normalized.length > 150) {
            return null;
        }
        
        // Check for corrupted extractions
        if (/^[A-Z]\d+/.test(normalized) || /\d{3,}/.test(normalized)) {
            return null;
        }
        
        return normalized;
    }

    calculateParsingConfidence(company, position, status) {
        let confidence = 0;
        
        if (company) confidence += 0.4;
        if (position) confidence += 0.4;
        if (status) confidence += 0.2;
        
        if (confidence >= 0.8) return 'high';
        if (confidence >= 0.4) return 'medium';
        return 'low';
    }
}

// Singleton instance
let enhancedFallbackInstance = null;

function getEnhancedFallbackSystem() {
    if (!enhancedFallbackInstance) {
        enhancedFallbackInstance = new EnhancedFallbackSystem();
    }
    return enhancedFallbackInstance;
}

module.exports = {
    EnhancedFallbackSystem,
    getEnhancedFallbackSystem
};