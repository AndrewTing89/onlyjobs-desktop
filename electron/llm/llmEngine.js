"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEmailWithLLM = void 0;
const crypto_1 = require("crypto");
const config_1 = require("./config");
const rules_1 = require("./rules");
// We import lazily since node-llama-cpp is heavy
let llamaModule = null;
let loadedSession = null; // LlamaChatSession
let loadedContext = null; // LlamaContext
let loadedModel = null; // LlamaModel
let loadedModelPath = null;
async function loadLlamaModule() {
    if (llamaModule)
        return llamaModule;
    try {
        llamaModule = await import('node-llama-cpp');
        return llamaModule;
    }
    catch (error) {
        throw new Error("node-llama-cpp is not installed or failed to build. Run: npm i node-llama-cpp --legacy-peer-deps (or with --build-from-source)");
    }
}
const schema = {
    type: "object",
    properties: {
        is_job_related: { type: "boolean" },
        company: { type: ["string", "null"] },
        position: { type: ["string", "null"] },
        status: { type: ["string", "null"], enum: ["Applied", "Interview", "Declined", "Offer", null] },
    },
    required: ["is_job_related", "company", "position", "status"],
    additionalProperties: false,
};
const SYSTEM_PROMPT = [
    "You are an email classification expert. Output ONLY valid JSON matching the required schema with no additional text.",
    "",
    "TASK: Analyze email content to determine if it relates to job applications and extract key information.",
    "",
    "JOB-RELATED CLASSIFICATION:",
    "- TRUE: job applications, recruiting emails, ATS notifications, interview invitations, rejections, offers, hiring process communications",
    "- FALSE: newsletters, promotional content, general career advice, unrelated business emails",
    "",
    "EXTRACTION RULES:",
    "1. If is_job_related=false → set all other fields to null",
    "2. If is_job_related=true → extract available information:",
    "",
    "ATS SYSTEM RECOGNITION:",
    "Common ATS domains that require special handling:",
    "- Workday: @myworkday.com (e.g., pnc@myworkday.com → company is PNC)",
    "- Taleo: @oracle.taleo.net (e.g., company@oracle.taleo.net → extract company prefix)",
    "- Greenhouse: @greenhouse.io (generic recruiting platform)",
    "- Lever: @lever.co (generic recruiting platform)",
    "- SmartRecruiters: @smartrecruiters.com (generic recruiting platform)",
    "- BambooHR: various domains with 'bamboohr' in name",
    "",
    "COMPANY EXTRACTION (ATS-ENHANCED PRIORITY):",
    "- Priority 1: Body text company mentions (e.g., 'opportunity with PNC', 'interest in Google', 'PNC Talent Acquisition')",
    "- Priority 2: Email signature/footer company names (e.g., 'Best, Google Recruiting', 'Centene Talent Attraction')",
    "- Priority 3: ATS domain prefix extraction (e.g., 'pnc@myworkday.com' → 'PNC', 'apple@oracle.taleo.net' → 'Apple')",
    "- Priority 4: Multiple company references (e.g., 'Turnberry Solutions // Crew' → extract primary: 'Crew')",
    "- Priority 5: Standard domain extraction for non-ATS emails (e.g., @google.com → Google)",
    "- Look for patterns: 'opportunity with [Company]', 'interest in [Company]', '[Company] Talent', '[Company] Recruiting', '[Company] team'",
    "- Handle complex names: 'Environmental Science Associates', 'Meyer Corp. US', 'Atlas Field Services'",
    "- Use null if company cannot be determined with confidence",
    "",
    "POSITION EXTRACTION (WITH JOB CODE HANDLING):",
    "- Strip job reference codes/IDs (e.g., 'R196209 Data Analyst Senior' → 'Data Analyst Senior')",
    "- Common job code patterns: alphanumeric codes before position (REQ123, R196209, JOB-456, etc.)",
    "- Extract clean job title/role name when explicitly mentioned",
    "- Look for phrases like 'for the [position]', 'as a [role]', '[title] position', 'application for [code] [title]'",
    "- Use null if position is not clearly specified",
    "",
    "STATUS CLASSIFICATION (select most specific applicable status):",
    "- Applied: confirmation of application submission/receipt",
    "- Interview: interview scheduling, invitations, confirmations, assessment passes",
    "- Declined: rejections, 'not moving forward', 'regret to inform', 'other candidates'",
    "- Offer: job offers, compensation discussions, offer letters",
    "- null: use when status cannot be determined or doesn't fit above categories",
    "",
    "FEW-SHOT EXAMPLES:",
    "",
    "Example 1 (ATS - Workday/PNC - CRITICAL FIX):",
    "From: pnc@myworkday.com",
    "Subject: [Not specified]",
    "Body: Dear Alex, We received your application for R196209 Data Analyst Senior position and appreciate your interest in an opportunity with PNC. If your qualifications meet the requirements of the role, a member of our Talent Acquisition team will contact you to discuss your experience. Visit our hiring process page to learn more about what to expect. If you are contacted about moving forward in the hiring process and require an accommodation, please let your recruiter know or see below for additional information about submitting a request. Sincerely, PNC Talent Acquisition Team",
    '{"is_job_related": true, "company": "PNC", "position": "Data Analyst Senior", "status": "Applied"}',
    "",
    "Example 2 (ATS - Taleo/Oracle System):",
    "From: microsoft@oracle.taleo.net",
    "Subject: Your application for Software Engineer II",
    "Body: Dear Candidate, Thank you for your interest in the REQ-2024-5678 Software Engineer II position at Microsoft. Your application has been successfully submitted and is currently under review. We will contact you if your qualifications match our requirements. Best regards, Microsoft Recruiting Team",
    '{"is_job_related": true, "company": "Microsoft", "position": "Software Engineer II", "status": "Applied"}',
    "",
    "Example 3 (ATS - Greenhouse System):",
    "From: jobs-noreply@greenhouse.io",
    "Subject: Application Update - Product Manager Role",
    "Body: Hi Alex, Your application for the JOB-PM-2024 Product Manager position at Stripe has moved to the next stage. Our hiring team would like to schedule a phone screen with you. Please use the link below to select your availability. Thank you for your interest in Stripe! Best, Stripe Talent Team",
    '{"is_job_related": true, "company": "Stripe", "position": "Product Manager", "status": "Interview"}',
    "",
    "Example 4 (ATS - Lever System):",
    "From: noreply@lever.co",
    "Subject: Thank you for applying to Airbnb",
    "Body: Dear Alex, We've received your application for the LEVER-456 Senior Data Scientist role at Airbnb. We appreciate your interest in joining our team. While we review applications, feel free to learn more about our culture and values. If your background aligns with what we're looking for, someone from our team will be in touch. Best, Airbnb Recruiting",
    '{"is_job_related": true, "company": "Airbnb", "position": "Senior Data Scientist", "status": "Applied"}',
    "",
    "Example 5 (ATS - SmartRecruiters):",
    "From: noreply@smartrecruiters.com",
    "Subject: Application Received - Netflix",
    "Body: Hello, Your application for SR-789-2024 Machine Learning Engineer at Netflix has been received. We will review your qualifications and contact you if we'd like to move forward. We appreciate your interest in Netflix and our mission to entertain the world. Regards, Netflix Talent Acquisition",
    '{"is_job_related": true, "company": "Netflix", "position": "Machine Learning Engineer", "status": "Applied"}',
    "",
    "Example 6 (Standard Email - Rejection):",
    "Subject: [Not specified]",
    "Body: Dear Zicheng, Thank you for your interest in Meyer Corp. US and the Product & Insights Analyst position. Though your background is impressive, it is not an exact match with the skills and experience we are seeking for this particular role. We appreciate your time and consideration and wish you the best in your job search. Best regards, MEYER Talent Acquisition Team Meyer Corp. US",
    '{"is_job_related": true, "company": "Meyer Corp. US", "position": "Product & Insights Analyst", "status": "Declined"}',
    "",
    "Example 7 (Standard Email - Interview/Assessment):",
    "Subject: [Not specified]",
    "Body: Hi Alex Zhao, Congratulations! You passed the Google Hiring Assessment. Our Recruiting team is reviewing your candidacy for next steps. For some roles, an additional online assessment may be used to further evaluate your role-related knowledge in key areas. If that applies to you, we'll reach out with additional information. Your 'pass' on this assessment will also be valid for 24 months should you apply for additional roles in the future. Thanks for your interest in a role at Google. Best, Google Recruiting",
    '{"is_job_related": true, "company": "Google", "position": null, "status": "Interview"}',
    "",
    "Example 8 (Standard Email - Application Submitted):",
    "Subject: Application submitted",
    "Body: Indeed Application submitted Utility Data Analyst Atlas Field Services - Fremont, CA The following items were sent to Atlas Field Services. Good luck! • Application • Resume Next steps • The employer or job advertiser may reach out to you about your application.",
    '{"is_job_related": true, "company": "Atlas Field Services", "position": "Utility Data Analyst", "status": "Applied"}',
    "",
    "Example 9 (Standard Email - Rejection - Multiple Company Names):",
    "Subject: [Not specified]",
    "Body: Hello Zicheng, Thank you for your interest in Crew and our commitment to consultant development! We appreciate the time and effort you put into applying for our position. However, we have decided to pursue other candidates whose skills and experience better match our needs at this time. We wish you success in all your future endeavors! Crew Recruiting and Talent Turnberry Solutions // Crew",
    '{"is_job_related": true, "company": "Crew", "position": null, "status": "Declined"}',
    "",
    "Example 10 (Standard Email - Rejection - Long Company Name):",
    "Subject: [Not specified]",
    "Body: Zicheng, Thank you for your interest in Business Data Analyst at Environmental Science Associates! We greatly appreciate your initiative to join our team and are honored to have been considered for your career journey. We've been fortunate to receive an overwhelming response from accomplished candidates as yourself. However, after careful consideration, the hiring team has made a decision to move forward with other candidates at this time. We'd love to stay in touch as our team continues to grow and reconnect down the line. Thanks again for your interest in Environmental Science Associates and we wish you the best with your search for a new role. Warmly, Environmental Science Associates",
    '{"is_job_related": true, "company": "Environmental Science Associates", "position": "Business Data Analyst", "status": "Declined"}',
    "",
    "Example 11 (Centene Pattern - Key Reference Case):",
    "Subject: [Not specified]",
    "Body: Hello Alex, After reviewing your application for the Business Reporting Analyst II position, we want to inform you that visa sponsorship is not offered or available for this position and we are moving forward with other candidates. We appreciate your interest in wanting to work at Centene and supporting our mission to transform the health of the communities we serve, one person at a time. Best wishes in your job search, Centene Talent Attraction",
    '{"is_job_related": true, "company": "Centene", "position": "Business Reporting Analyst II", "status": "Declined"}',
    "",
    "OUTPUT CONSTRAINTS:",
    "- Never use string 'unknown' - use null instead",
    "- Maintain exact JSON schema compliance",
    "- Be decisive - avoid ambiguous classifications",
    "- Pay attention to any provided status hints for guidance",
    "- Extract company names as shown in the examples above",
].join("\n");
const cache = new Map();
function makeCacheKey(subject, plaintext) {
    const canonical = subject + "\n" + plaintext.slice(0, 1000);
    return crypto_1.createHash("sha256").update(canonical).digest("hex");
}
async function ensureSession(modelPath) {
    if (loadedSession && loadedModelPath === modelPath)
        return loadedSession;
    const module = await loadLlamaModule();
    const { getLlama, LlamaModel, LlamaContext, LlamaChatSession } = module;
    const llama = await getLlama();
    loadedModel = await llama.loadModel({ modelPath });
    loadedContext = await loadedModel.createContext({ contextSize: config_1.LLM_CONTEXT, batchSize: 512 });
    const sequence = loadedContext.getSequence();
    loadedSession = new LlamaChatSession({ contextSequence: sequence, systemPrompt: SYSTEM_PROMPT });
    loadedModelPath = modelPath;
    return loadedSession;
}
async function parseEmailWithLLM(input) {
    const subject = input.subject ?? "";
    const plaintext = input.plaintext ?? "";
    const modelPath = input.modelPath ?? config_1.DEFAULT_MODEL_PATH;
    const temperature = input.temperature ?? config_1.LLM_TEMPERATURE;
    const maxTokens = input.maxTokens ?? config_1.LLM_MAX_TOKENS;
    const key = makeCacheKey(subject, plaintext);
    const cached = cache.get(key);
    if (cached)
        return cached;
    const session = await ensureSession(modelPath);
    const hint = (0, rules_1.getStatusHint)(subject, plaintext);
    const userPrompt = [
        hint ? `${hint}` : null,
        `Input`,
        `Subject: ${subject}`,
        `Body: ${plaintext}`,
        `Output`,
    ]
        .filter(Boolean)
        .join("\n");
    const response = await session.prompt(userPrompt, {
        temperature,
        maxTokens,
        responseFormat: {
            type: "json_schema",
            schema,
            schema_id: "OnlyJobsEmailParseSchema",
        },
    });
    // node-llama-cpp with responseFormat json_schema guarantees valid JSON matching schema
    // but we still defensively parse and coerce nulls instead of 'unknown'
    let parsed;
    try {
        parsed = JSON.parse(response);
    }
    catch (err) {
        // Should not happen with json_schema, but ensure hard fallback
        parsed = { is_job_related: false, company: null, position: null, status: null };
    }
    // Enforce rules: if not job-related, everything else null
    if (!parsed.is_job_related) {
        parsed.company = null;
        parsed.position = null;
        parsed.status = null;
    }
    // Never return 'unknown' strings
    if (parsed.company && /^unknown$/i.test(parsed.company))
        parsed.company = null;
    if (parsed.position && /^unknown$/i.test(parsed.position))
        parsed.position = null;
    cache.set(key, parsed);
    return parsed;
}
exports.parseEmailWithLLM = parseEmailWithLLM;
