/**
 * Email pre-filtering rules for quick classification
 * Avoids unnecessary LLM calls for obvious cases
 */

// Domains that are definitely NOT job-related
const NON_JOB_DOMAINS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'stackoverflow.com',
  'medium.com',
  'substack.com',
  'mailchimp.com',
  'sendgrid.net',
  'amazonses.com',
  'google.com', // Careful: Google Careers uses different domain
  'microsoft.com', // Careful: Microsoft Careers uses different domain
  'apple.com', // Careful: Apple Jobs uses different domain
  'facebook.com',
  'twitter.com',
  'linkedin.com', // Careful: Job alerts come from different subdomain
  'youtube.com',
  'reddit.com',
  'discord.com',
  'slack.com',
  'zoom.us',
  'calendly.com',
  'typeform.com',
  'surveymonkey.com',
  'eventbrite.com',
  'meetup.com',
  'stripe.com',
  'paypal.com',
  'shopify.com',
  'etsy.com',
  'ebay.com',
  'amazon.com',
  'netflix.com',
  'spotify.com',
  'dropbox.com',
  'box.com',
  'notion.so',
  'airtable.com',
  'trello.com',
  'asana.com',
  'monday.com',
  'clickup.com',
  'figma.com',
  'canva.com',
  'adobe.com',
  'mailgun.com',
  'twilio.com',
  'auth0.com',
  'okta.com',
  'cloudflare.com',
  'vercel.com',
  'netlify.com',
  'heroku.com',
  'digitalocean.com',
  'linode.com'
];

// ATS (Applicant Tracking System) domains - definitely job-related
const ATS_DOMAINS = [
  'myworkday.com',
  'myworkdayjobs.com',
  'wd1.myworkdaysite.com',
  'wd3.myworkdaysite.com',
  'wd5.myworkdaysite.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'jobvite.com',
  'taleo.net',
  'brassring.com',
  'icims.com',
  'ultipro.com',
  'adp.com',
  'bamboohr.com',
  'successfactors.com',
  'workable.com',
  'smartrecruiters.com',
  'jazz.co',
  'applytojob.com',
  'hire.withgoogle.com',
  'amazon.jobs',
  'careers.microsoft.com',
  'jobs.apple.com',
  'metacareers.com',
  'careers.google.com'
];

// Job board domains - likely job-related
const JOB_BOARD_DOMAINS = [
  'indeed.com',
  'indeedemail.com',
  'glassdoor.com',
  'monster.com',
  'careerbuilder.com',
  'ziprecruiter.com',
  'simplyhired.com',
  'dice.com',
  'angel.co',
  'angellist.com',
  'wellfound.com',
  'themuse.com',
  'flexjobs.com',
  'remote.co',
  'weworkremotely.com',
  'remotive.io',
  'hired.com',
  'triplebyte.com',
  'vettery.com',
  'underdog.io'
];

// Keywords that strongly indicate job-related emails
const JOB_KEYWORDS_REGEX = [
  // Application status
  /thank you for (your )?applying/i,
  /application (has been |was )?received/i,
  /we (have )?received your application/i,
  /your application for/i,
  /applied for the .* position/i,
  /submitted your application/i,
  
  // Interview related
  /schedule.*(interview|call|meeting)/i,
  /interview.*(schedule|invitation|request)/i,
  /would like to (interview|speak|chat)/i,
  /next (steps|stage) in (the|our) (hiring|recruitment|interview) process/i,
  /passed.*(assessment|test|challenge)/i,
  /coding (challenge|assessment|test)/i,
  /technical (assessment|interview|screen)/i,
  
  // Offer related
  /job offer/i,
  /offer letter/i,
  /pleased to (offer|extend)/i,
  /compensation package/i,
  /salary.*(offer|package|details)/i,
  /background check/i,
  /reference check/i,
  
  // Rejection related
  /regret to inform/i,
  /not.*(selected|moving forward|proceed)/i,
  /decided not to (move|proceed)/i,
  /other candidate/i,
  /position has been filled/i,
  /no longer (available|open)/i,
  /unsuccessful/i,
  
  // Status updates
  /application (status|update)/i,
  /status of your application/i,
  /regarding your (application|candidacy)/i,
  /update on your application/i,
  
  // Position specific
  /software engineer/i,
  /data scientist/i,
  /product manager/i,
  /designer/i,
  /developer/i,
  /analyst/i,
  /consultant/i,
  /manager/i,
  /director/i,
  /specialist/i,
  /coordinator/i,
  /administrator/i
];

// Keywords that indicate NOT job-related
const NON_JOB_KEYWORDS_REGEX = [
  /newsletter/i,
  /unsubscribe/i,
  /weekly digest/i,
  /blog post/i,
  /new article/i,
  /webinar/i,
  /course/i,
  /certification/i,
  /invoice/i,
  /receipt/i,
  /payment/i,
  /subscription/i,
  /free trial/i,
  /special offer/i,
  /discount/i,
  /sale/i,
  /deal/i,
  /coupon/i,
  /survey/i,
  /feedback/i,
  /review/i,
  /github action/i,
  /pull request/i,
  /issue/i,
  /commit/i,
  /deployment/i,
  /build failed/i,
  /security alert/i,
  /dependency/i,
  /npm/i,
  /yarn/i
];

/**
 * Extract domain from email address
 */
function getDomain(email) {
  if (!email) return null;
  const match = email.match(/@([^\s>]+)/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check if email is definitely NOT job-related
 */
function isDefinitelyNotJob(email) {
  const domain = getDomain(email.from);
  
  // Check non-job domains
  if (domain && NON_JOB_DOMAINS.includes(domain)) {
    return true;
  }
  
  // Check non-job keywords in subject
  if (email.subject) {
    for (const regex of NON_JOB_KEYWORDS_REGEX) {
      if (regex.test(email.subject)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if email is definitely job-related
 */
function isDefinitelyJob(email) {
  const domain = getDomain(email.from);
  
  // Check ATS domains
  if (domain) {
    // Check exact ATS domains
    if (ATS_DOMAINS.includes(domain)) {
      return true;
    }
    
    // Check if subdomain of ATS
    for (const atsDomain of ATS_DOMAINS) {
      if (domain.endsWith('.' + atsDomain) || domain === atsDomain) {
        return true;
      }
    }
    
    // Check job board domains
    if (JOB_BOARD_DOMAINS.includes(domain)) {
      return true;
    }
  }
  
  // Check job keywords in subject
  if (email.subject) {
    for (const regex of JOB_KEYWORDS_REGEX) {
      if (regex.test(email.subject)) {
        return true;
      }
    }
  }
  
  // Check job keywords in body (first 500 chars for performance)
  if (email.body) {
    const bodySnippet = email.body.substring(0, 500);
    for (const regex of JOB_KEYWORDS_REGEX) {
      if (regex.test(bodySnippet)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Pre-classify email before sending to LLM
 * Returns: 'not_job', 'definitely_job', or 'uncertain'
 */
function preClassifyEmail(email) {
  // Quick rejection
  if (isDefinitelyNotJob(email)) {
    return 'not_job';
  }
  
  // Quick acceptance
  if (isDefinitelyJob(email)) {
    return 'definitely_job';
  }
  
  // Needs LLM classification
  return 'uncertain';
}

/**
 * Extract company hint from ATS domain
 */
function extractCompanyFromATSDomain(email) {
  const domain = getDomain(email.from);
  if (!domain) return null;
  
  // Workday domains often have company name
  if (domain.includes('myworkday')) {
    // e.g., 'pfizer.wd1.myworkdaysite.com' -> 'Pfizer'
    const match = domain.match(/^([^.]+)\./);
    if (match) {
      const company = match[1];
      // Capitalize first letter
      return company.charAt(0).toUpperCase() + company.slice(1);
    }
  }
  
  // Some companies use their domain directly
  const knownCompanyDomains = {
    'amazon.jobs': 'Amazon',
    'careers.google.com': 'Google',
    'careers.microsoft.com': 'Microsoft',
    'jobs.apple.com': 'Apple',
    'metacareers.com': 'Meta'
  };
  
  if (knownCompanyDomains[domain]) {
    return knownCompanyDomains[domain];
  }
  
  return null;
}

module.exports = {
  preClassifyEmail,
  isDefinitelyNotJob,
  isDefinitelyJob,
  getDomain,
  extractCompanyFromATSDomain,
  ATS_DOMAINS,
  JOB_BOARD_DOMAINS,
  NON_JOB_DOMAINS,
  JOB_KEYWORDS_REGEX,
  NON_JOB_KEYWORDS_REGEX
};