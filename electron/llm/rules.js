"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatusHint = void 0;
const PHRASES = {
    applied: [
        /received your application/i,
        /thanks for applying/i,
        /submitted your application/i,
        /application received/i,
        /application submitted/i,
        /successfully applied/i,
        /have successfully applied/i,
        /you have successfully applied/i,
        /application.*has been received/i,
        /we have received your application/i,
        /application.*under review/i,
        /eagerly reviewing/i,
        /reviewing your.*skills/i,
        /thanks for your interest.*role/i,
        /applied.*to.*role/i,
        /applied.*for.*position/i,
        // Indeed-specific patterns
        /indeed application:/i,
        /application submitted.*,.*,/i, // Pattern: "Application submitted, Position, Company - Location"
        /you applied.*through.*indeed/i,
        /you applied.*through.*linkedin/i,
        /you applied.*through.*ziprecruiter/i,
    ],
    interview: [
        /schedule/i,
        /availability/i,
        /interview/i,
        /meet/i,
        /call/i,
        /passed.*assessment/i,
        /congratulations.*passed/i,
        /next steps/i,
    ],
    rejected: [
        /regret to inform/i,
        /not move forward/i,
        /moving forward with other candidates/i,
        /unfortunately.*(not|no longer)\s+moving/i,
        /decline(d)?/i,
        /other candidates/i,
        /not an exact match/i,
        /pursue other candidates/i,
        /decided to pursue other candidates/i,
        /decided to move forward with/i,
        /have decided to pursue other/i,
        /more closely aligned with.*needs/i,
        /closer match.*requirements/i,
        /better fit.*position/i,
        /different direction/i,
        /will not be moving forward/i,
        /unable to move forward/i,
        /chosen to go with/i,
        /selected.*candidate/i,
        /proceeding with.*candidate/i,
        /continuing with other/i,
    ],
    offer: [
        /offer/i,
        /compensation package/i,
        /congratulations/i,
        /extend(ing)? you an offer/i,
    ],
};
function getStatusHint(subject, plaintext) {
    const hay = `${subject}\n${plaintext}`.slice(0, 4000);
    
    // Special handling for job board emails
    if (isJobBoardEmail(subject, plaintext)) {
        return 'hint: status=applied (job board platform detected - extract actual company from body)';
    }
    
    for (const status of Object.keys(PHRASES)) {
        const matches = PHRASES[status].some((rx) => rx.test(hay));
        if (matches)
            return `hint: status=${status}`;
    }
    return null;
}

/**
 * Detects if email is from a job board platform
 */
function isJobBoardEmail(subject, plaintext) {
    const jobBoardPatterns = [
        /indeed application:/i,
        /linkedin.*application/i,
        /ziprecruiter.*application/i,
        /monster.*application/i,
        /glassdoor.*application/i,
        /application submitted.*,.*,/i, // Indeed pattern: "Application submitted, Position, Company - Location"
        /through.*indeed/i,
        /through.*linkedin/i,
        /through.*ziprecruiter/i,
    ];
    
    const content = `${subject}\n${plaintext}`;
    return jobBoardPatterns.some(pattern => pattern.test(content));
}
exports.getStatusHint = getStatusHint;
exports.isJobBoardEmail = isJobBoardEmail;
