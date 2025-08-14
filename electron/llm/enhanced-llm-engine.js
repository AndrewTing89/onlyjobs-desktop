/**
 * Enhanced LLM Engine with Record Source Awareness
 * Optimized for handling manual records alongside automatic email processing
 */

const crypto = require("crypto");
const { DEFAULT_MODEL_PATH, LLM_TEMPERATURE, LLM_MAX_TOKENS, LLM_CONTEXT } = require("./config");
const { getStatusHint } = require("./rules");
const { RECORD_SOURCES, EDIT_SOURCES } = require("./metadata-schema");

// Enhanced result schema with metadata tracking
const ENHANCED_PARSE_SCHEMA = {
  type: "object",
  properties: {
    is_job_related: { type: "boolean" },
    company: { type: ["string", "null"] },
    position: { type: ["string", "null"] },
    status: { type: ["string", "null"], enum: ["Applied", "Interview", "Declined", "Offer", null] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    processing_context: {
      type: "object",
      properties: {
        email_indicators: { type: "array", items: { type: "string" } },
        extraction_method: { type: "string", enum: ["direct_parsing", "pattern_matching", "fuzzy_inference"] },
        data_quality: { type: "string", enum: ["high", "medium", "low"] },
        potential_duplicates: { type: "boolean" }
      }
    }
  },
  required: ["is_job_related", "company", "position", "status", "confidence", "processing_context"],
  additionalProperties: false,
};

// Separate cache instances for different record sources
const emailClassificationCache = new Map();
const manualRecordCache = new Map();
const hybridProcessingCache = new Map();

class EnhancedLLMEngine {
  constructor() {
    this.loadedSession = null;
    this.loadedContext = null;
    this.loadedModel = null;
    this.loadedModelPath = null;
    this.llamaModule = null;
  }

  async loadLlamaModule() {
    if (this.llamaModule) return this.llamaModule;
    try {
      this.llamaModule = await import('node-llama-cpp');
      return this.llamaModule;
    } catch (error) {
      throw new Error("node-llama-cpp is not installed or failed to build. Run: npm i node-llama-cpp --legacy-peer-deps");
    }
  }

  /**
   * Enhanced email parsing with record source awareness
   */
  async parseEmailWithContext(input, processingContext = {}) {
    const {
      subject = "",
      plaintext = "",
      fromAddress = "",
      headers = {},
      modelPath = DEFAULT_MODEL_PATH,
      temperature = LLM_TEMPERATURE,
      maxTokens = LLM_MAX_TOKENS,
      recordSource = RECORD_SOURCES.LLM_AUTO,
      existingRecords = [],
      skipDuplicateCheck = false
    } = input;

    // Enhanced cache key includes record source context
    const cacheKey = this.makeCacheKey(subject, plaintext, fromAddress, recordSource);
    const cache = this.getCacheForSource(recordSource);
    const cached = cache.get(cacheKey);
    
    if (cached && !skipDuplicateCheck) {
      return this.enhanceResultWithMetadata(cached, recordSource, processingContext);
    }

    // Pre-processing: Check for potential duplicates with existing manual records
    const duplicateAnalysis = this.analyzeForDuplicates(
      { subject, plaintext, fromAddress },
      existingRecords
    );

    const session = await this.ensureSession(modelPath);
    const hint = getStatusHint(subject, plaintext);
    
    // Enhanced prompt with context awareness
    const userPrompt = this.buildContextAwarePrompt(
      subject,
      plaintext,
      fromAddress,
      hint,
      duplicateAnalysis,
      processingContext
    );

    const response = await session.prompt(userPrompt, {
      temperature,
      maxTokens,
      responseFormat: {
        type: "json_schema",
        schema: ENHANCED_PARSE_SCHEMA,
        schema_id: "EnhancedEmailParseSchema",
      },
    });

    // Parse and validate response
    let parsed = this.extractAndValidateJSON(response);
    if (!parsed) {
      parsed = this.createFallbackResult(duplicateAnalysis);
    }

    // Enhanced post-processing with context
    parsed = this.postProcessWithContext(parsed, duplicateAnalysis, recordSource);
    
    // Cache with appropriate strategy
    this.cacheResultBySource(cacheKey, parsed, recordSource);
    
    return this.enhanceResultWithMetadata(parsed, recordSource, processingContext);
  }

  /**
   * Analyze for potential duplicates with existing manual records
   */
  analyzeForDuplicates(emailData, existingRecords) {
    const { subject, plaintext, fromAddress } = emailData;
    const potentialMatches = [];
    
    for (const record of existingRecords) {
      if (record.record_source === RECORD_SOURCES.MANUAL_CREATED) {
        const similarity = this.calculateRecordSimilarity(emailData, record);
        if (similarity > 0.7) {
          potentialMatches.push({
            recordId: record.job_id,
            similarity,
            matchFields: similarity.matchedFields,
            confidence: similarity.confidence
          });
        }
      }
    }

    return {
      hasPotentialDuplicates: potentialMatches.length > 0,
      matches: potentialMatches,
      riskLevel: this.assessDuplicateRisk(potentialMatches)
    };
  }

  /**
   * Calculate similarity between email and existing record
   */
  calculateRecordSimilarity(emailData, record) {
    const { subject, plaintext, fromAddress } = emailData;
    const combined = `${subject} ${plaintext}`.toLowerCase();
    
    let score = 0;
    const matchedFields = [];
    
    // Company matching
    if (record.company && combined.includes(record.company.toLowerCase())) {
      score += 0.4;
      matchedFields.push('company');
    }
    
    // Position matching
    if (record.position && combined.includes(record.position.toLowerCase())) {
      score += 0.4;
      matchedFields.push('position');
    }
    
    // Domain matching
    if (fromAddress && record.company_domain) {
      const emailDomain = fromAddress.split('@')[1];
      if (emailDomain && emailDomain.includes(record.company_domain)) {
        score += 0.2;
        matchedFields.push('domain');
      }
    }
    
    return {
      score,
      matchedFields,
      confidence: score > 0.7 ? 'high' : score > 0.4 ? 'medium' : 'low'
    };
  }

  /**
   * Build context-aware prompt with duplicate awareness
   */
  buildContextAwarePrompt(subject, plaintext, fromAddress, hint, duplicateAnalysis, context) {
    const cleanedPlaintext = this.cleanEmailContent(plaintext);
    const maxBodyLength = 1200;
    const truncatedBody = cleanedPlaintext.length > maxBodyLength 
      ? cleanedPlaintext.substring(0, maxBodyLength) + "... [truncated]"
      : cleanedPlaintext;

    const contextNotes = [];
    
    if (duplicateAnalysis.hasPotentialDuplicates) {
      contextNotes.push(`POTENTIAL DUPLICATE ALERT: This email may relate to manually created records for: ${duplicateAnalysis.matches.map(m => m.recordId).join(', ')}`);
    }
    
    if (context.manualRecordsPresent) {
      contextNotes.push("CONTEXT: User has manually created job records. Focus on EMAIL CONTENT only.");
    }

    return [
      hint ? `Status Hint: ${hint}` : null,
      contextNotes.length > 0 ? `Context: ${contextNotes.join(' ')}` : null,
      `From: ${fromAddress}`,
      `Subject: ${subject}`,
      `Body: ${truncatedBody}`,
      `Extract job information from THIS EMAIL only. Do not assume connections to existing records.`
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Post-process results with context awareness
   */
  postProcessWithContext(parsed, duplicateAnalysis, recordSource) {
    // Enforce schema rules
    if (!parsed.is_job_related) {
      parsed.company = null;
      parsed.position = null;
      parsed.status = null;
    }

    // Enhanced processing context
    if (!parsed.processing_context) {
      parsed.processing_context = {};
    }
    
    parsed.processing_context.potential_duplicates = duplicateAnalysis.hasPotentialDuplicates;
    parsed.processing_context.duplicate_risk = duplicateAnalysis.riskLevel;
    
    // Clean extracted values
    if (parsed.company) {
      parsed.company = this.cleanCompanyName(parsed.company);
    }
    
    if (parsed.position) {
      parsed.position = this.cleanPositionTitle(parsed.position);
    }

    return parsed;
  }

  /**
   * Enhanced result with metadata for record tracking
   */
  enhanceResultWithMetadata(result, recordSource, processingContext) {
    return {
      ...result,
      metadata: {
        record_source: recordSource,
        processed_at: new Date().toISOString(),
        model_version: this.getModelVersion(),
        processing_context: processingContext,
        cache_strategy: this.getCacheStrategyForSource(recordSource)
      }
    };
  }

  /**
   * Get appropriate cache for record source
   */
  getCacheForSource(recordSource) {
    switch (recordSource) {
      case RECORD_SOURCES.MANUAL_CREATED:
      case RECORD_SOURCES.MANUAL_EDITED:
        return manualRecordCache;
      case RECORD_SOURCES.HYBRID:
        return hybridProcessingCache;
      default:
        return emailClassificationCache;
    }
  }

  /**
   * Cache result with source-aware strategy
   */
  cacheResultBySource(key, result, recordSource) {
    const cache = this.getCacheForSource(recordSource);
    
    // Different TTL strategies by source
    const ttl = this.getCacheTTLForSource(recordSource);
    if (ttl > 0) {
      cache.set(key, {
        ...result,
        cached_at: Date.now(),
        expires_at: Date.now() + ttl
      });
    }
  }

  /**
   * Get cache TTL based on record source
   */
  getCacheTTLForSource(recordSource) {
    switch (recordSource) {
      case RECORD_SOURCES.MANUAL_CREATED:
        return 0; // No caching for manual records
      case RECORD_SOURCES.MANUAL_EDITED:
        return 1000 * 60 * 5; // 5 minutes for edited records
      case RECORD_SOURCES.HYBRID:
        return 1000 * 60 * 15; // 15 minutes for hybrid
      default:
        return 1000 * 60 * 60 * 24; // 24 hours for email processing
    }
  }

  /**
   * Assess duplicate risk level
   */
  assessDuplicateRisk(matches) {
    if (matches.length === 0) return 'none';
    const highConfidenceMatches = matches.filter(m => m.confidence === 'high');
    if (highConfidenceMatches.length > 0) return 'high';
    const mediumConfidenceMatches = matches.filter(m => m.confidence === 'medium');
    if (mediumConfidenceMatches.length > 0) return 'medium';
    return 'low';
  }

  /**
   * Invalidate cache for edited records
   */
  invalidateCacheForJob(jobId, recordSource) {
    const cache = this.getCacheForSource(recordSource);
    // Remove cache entries related to this job
    for (const [key, value] of cache.entries()) {
      if (value.metadata && value.metadata.jobId === jobId) {
        cache.delete(key);
      }
    }
  }

  /**
   * Clean email content (inherited from original implementation)
   */
  cleanEmailContent(text) {
    if (!text || typeof text !== 'string') return '';
    
    let cleaned = text;
    
    // Decode HTML entities
    const htmlEntities = {
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
      '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&rsquo;': "'",
      '&lsquo;': "'", '&rdquo;': '"', '&ldquo;': '"', '&mdash;': '—',
      '&ndash;': '–', '&hellip;': '...', '&copy;': '©', '&reg;': '®', '&trade;': '™'
    };
    
    for (const [entity, replacement] of Object.entries(htmlEntities)) {
      cleaned = cleaned.replace(new RegExp(entity, 'g'), replacement);
    }
    
    // Remove HTML tags and clean whitespace
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  // Additional utility methods (cleanCompanyName, cleanPositionTitle, etc.)
  cleanCompanyName(company) {
    if (!company || typeof company !== 'string') return null;
    let cleaned = company.trim().replace(/\s+(Inc|LLC|Corp|Ltd|Company|Co)\.?$/i, '');
    return cleaned.length < 2 ? null : cleaned;
  }

  cleanPositionTitle(position) {
    if (!position || typeof position !== 'string') return null;
    let cleaned = position.trim()
      .replace(/\b[A-Z]_?\d{4,}\b/g, '') // Remove job codes
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length < 2 ? null : cleaned;
  }

  makeCacheKey(subject, plaintext, fromAddress, recordSource) {
    const canonical = `${recordSource}:${fromAddress}:${subject}:${plaintext.slice(0, 1000)}`;
    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  extractAndValidateJSON(response) {
    try {
      const cleaned = response.trim()
        .replace(/```(?:json)?\s*([\s\S]*?)\s*```/, '$1')
        .replace(/:\s*True\b/g, ': true')
        .replace(/:\s*False\b/g, ': false')
        .replace(/:\s*None\b/g, ': null');
      return JSON.parse(cleaned);
    } catch (error) {
      console.log('JSON parsing failed:', error.message);
      return null;
    }
  }

  createFallbackResult(duplicateAnalysis) {
    return {
      is_job_related: false,
      company: null,
      position: null,
      status: null,
      confidence: 0.1,
      processing_context: {
        email_indicators: [],
        extraction_method: "fallback",
        data_quality: "low",
        potential_duplicates: duplicateAnalysis.hasPotentialDuplicates
      }
    };
  }

  async ensureSession(modelPath) {
    if (this.loadedSession && this.loadedModelPath === modelPath) {
      return this.loadedSession;
    }
    
    const module = await this.loadLlamaModule();
    const { getLlama, LlamaModel, LlamaContext, LlamaChatSession } = module;
    const llama = await getLlama();
    
    this.loadedModel = await llama.loadModel({ modelPath });
    this.loadedContext = await this.loadedModel.createContext({ 
      contextSize: LLM_CONTEXT, 
      batchSize: 512 
    });
    
    const sequence = this.loadedContext.getSequence();
    this.loadedSession = new LlamaChatSession({ 
      contextSequence: sequence, 
      systemPrompt: require('./prompts').SYSTEM_PROMPT 
    });
    
    this.loadedModelPath = modelPath;
    return this.loadedSession;
  }

  getModelVersion() {
    return 'enhanced-llm-v1.0-2024';
  }

  getCacheStrategyForSource(recordSource) {
    switch (recordSource) {
      case RECORD_SOURCES.MANUAL_CREATED: return 'no_cache';
      case RECORD_SOURCES.MANUAL_EDITED: return 'short_term';
      case RECORD_SOURCES.HYBRID: return 'medium_term';
      default: return 'standard';
    }
  }
}

module.exports = EnhancedLLMEngine;