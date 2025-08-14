/**
 * Specialized Indeed Email Handler
 * Ultra-fast pattern-based extraction for indeedapply@indeed.com emails
 * Optimized for Llama-3.2-3B with <100 token LLM fallback
 */

// No import needed - avoiding circular dependency

/**
 * Check if email is from Indeed
 */
function isIndeedEmail(input) {
    // Check all possible field mappings for from address
    // The provider.js maps fromAddress -> from, but we need to check the original input too
    const fromAddress = input.from || input.fromAddress || input.sender || '';
    return fromAddress.toLowerCase().includes('indeedapply@indeed.com');
}

/**
 * Extract company and position using Indeed's exact patterns
 */
function extractIndeedPatterns(subject, plaintext) {
    const result = {
        company: null,
        position: null,
        status: 'Applied' // All Indeed emails are applications
    };

    // Extract position from subject: "Indeed Application: [POSITION]"
    const subjectMatch = subject.match(/Indeed Application:\s*(.+)$/i);
    if (subjectMatch && subjectMatch[1]) {
        result.position = subjectMatch[1].trim();
    }

    // Extract company from "sent to [COMPANY]" pattern (most reliable)
    const sentToMatch = plaintext.match(/(?:items were sent to|sent to)\s+([^.\n]+?)\.?\s*(?:Good luck|$)/i);
    if (sentToMatch && sentToMatch[1]) {
        result.company = sentToMatch[1].trim();
    }

    // Fallback: Extract company from "[COMPANY] - [Location]" pattern
    if (!result.company) {
        const lines = plaintext.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            // Look for company-location pattern after position
            if (trimmedLine.includes(' - ') && trimmedLine.length > 3) {
                const companyLocationMatch = trimmedLine.match(/^([^-]+?)\s*-\s*(.+)$/);
                if (companyLocationMatch && companyLocationMatch[1]) {
                    const company = companyLocationMatch[1].trim();
                    // Validate it's not a number or review count
                    if (company.length > 1 && !/^\d+/.test(company) && !company.toLowerCase().includes('review')) {
                        result.company = company;
                        break;
                    }
                }
            }
        }
    }

    return result;
}

/**
 * Ultra-compact LLM prompt for Indeed emails only (fallback)
 */
const INDEED_LLM_PROMPT = [
    "Extract from Indeed email. JSON: {\"company\":str|null,\"position\":str|null,\"status\":\"Applied\"}",
    "Position: from subject 'Indeed Application: [TITLE]'",
    "Company: from 'sent to [COMPANY]. Good luck!'",
    "Ex: 'sent to Visa. Good luck!' → {\"company\":\"Visa\",\"position\":\"Data Analyst\",\"status\":\"Applied\"}"
].join("\n");

/**
 * LLM fallback for Indeed emails (ultra-compact)
 */
async function parseIndeedWithLLM(input) {
    try {
        const { getLlama, LlamaModel, LlamaContext, LlamaChatSession } = await import('node-llama-cpp');
        const config = require('./config');
        
        // Use minimal context for Indeed-only processing
        const llama = await getLlama();
        const model = await llama.loadModel({ modelPath: config.DEFAULT_MODEL_PATH });
        const context = await model.createContext({ contextSize: 512, batchSize: 128 });
        const sequence = context.getSequence();
        const session = new LlamaChatSession({ 
            contextSequence: sequence, 
            systemPrompt: INDEED_LLM_PROMPT 
        });

        const userPrompt = `Subject: ${input.subject || ''}\nBody: ${(input.plaintext || '').substring(0, 300)}`;
        
        const response = await session.prompt(userPrompt, {
            temperature: 0.1,
            maxTokens: 100,
            responseFormat: {
                type: "json_schema",
                schema: {
                    type: "object",
                    properties: {
                        company: { type: ["string", "null"] },
                        position: { type: ["string", "null"] },
                        status: { type: "string", enum: ["Applied"] }
                    },
                    required: ["company", "position", "status"],
                    additionalProperties: false
                }
            }
        });

        // Clean up context
        context.dispose();

        const parsed = JSON.parse(response);
        return {
            is_job_related: true,
            company: parsed.company,
            position: parsed.position,
            status: parsed.status || 'Applied'
        };

    } catch (error) {
        console.log('Indeed LLM fallback failed:', error.message);
        return null;
    }
}

/**
 * Main Indeed email handler
 */
async function parseIndeedEmail(input) {
    const subject = input.subject || '';
    const plaintext = input.plaintext || '';

    // Try pattern-based extraction first (fastest)
    const patternResult = extractIndeedPatterns(subject, plaintext);
    
    // If we got both company and position, we're done
    if (patternResult.company && patternResult.position) {
        return {
            is_job_related: true,
            company: patternResult.company,
            position: patternResult.position,
            status: patternResult.status
        };
    }

    console.log('🔄 Indeed pattern extraction incomplete, trying LLM fallback');
    
    // Try ultra-compact LLM for Indeed
    const llmResult = await parseIndeedWithLLM(input);
    if (llmResult && (llmResult.company || llmResult.position)) {
        return llmResult;
    }

    console.log('🔄 Indeed LLM failed, returning conservative result');
    
    // Conservative Indeed result - avoid circular dependency with generic LLM
    return {
        is_job_related: true,
        company: patternResult.company,
        position: patternResult.position || 'Job Application',
        status: 'Applied'
    };
}

module.exports = {
    isIndeedEmail,
    parseIndeedEmail,
    extractIndeedPatterns
};