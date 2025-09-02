/**
 * Centralized Confidence Configuration
 * 
 * This module provides unified confidence scoring standards across the entire application.
 * All confidence-related thresholds and logic should use these values.
 */

// Standard confidence thresholds (0-1 scale)
const CONFIDENCE_THRESHOLDS = {
  // Core classification thresholds
  VERY_LOW: 0.3,      // 0.0-0.3: Very low confidence, needs review
  LOW: 0.5,           // 0.3-0.5: Low confidence, needs review  
  MEDIUM: 0.7,        // 0.5-0.7: Medium confidence, optional review
  HIGH: 0.9,          // 0.7-0.9: High confidence, can auto-approve
  VERY_HIGH: 1.0,     // 0.9-1.0: Very high confidence, auto-approve
  
  // Functional thresholds
  NEEDS_REVIEW: 0.7,        // Below this = needs human review
  AUTO_APPROVE: 0.9,        // Above this = can auto-approve
  MIN_JOB_STORAGE: 0.6,     // Minimum confidence to store as job
  DIGEST_FILTER: 0.8,       // Confidence for digest/newsletter detection
  
  // Retention thresholds (for email cleanup)
  VERY_UNCERTAIN_DAYS: 30,  // Keep very uncertain emails for 30 days
  UNCERTAIN_DAYS: 14,       // Keep uncertain emails for 14 days
  CERTAIN_DAYS: 7          // Keep certain non-job emails for 7 days
};

// Confidence level definitions with UI properties
const CONFIDENCE_LEVELS = {
  very_low: {
    level: 'very_low',
    threshold: CONFIDENCE_THRESHOLDS.VERY_LOW,
    color: '#d32f2f',
    backgroundColor: '#d32f2f10',
    borderColor: '#d32f2f30',
    label: 'Very Low',
    description: 'Very uncertain - needs review',
    needsReview: true
  },
  low: {
    level: 'low', 
    threshold: CONFIDENCE_THRESHOLDS.LOW,
    color: '#f57c00',
    backgroundColor: '#f57c0010', 
    borderColor: '#f57c0030',
    label: 'Low',
    description: 'Low confidence - needs review',
    needsReview: true
  },
  medium: {
    level: 'medium',
    threshold: CONFIDENCE_THRESHOLDS.MEDIUM,
    color: '#fbc02d',
    backgroundColor: '#fbc02d10',
    borderColor: '#fbc02d30', 
    label: 'Medium',
    description: 'Medium confidence - optional review',
    needsReview: false
  },
  high: {
    level: 'high',
    threshold: CONFIDENCE_THRESHOLDS.HIGH,
    color: '#388e3c',
    backgroundColor: '#388e3c10',
    borderColor: '#388e3c30',
    label: 'High', 
    description: 'High confidence - can auto-approve',
    needsReview: false
  },
  very_high: {
    level: 'very_high',
    threshold: CONFIDENCE_THRESHOLDS.VERY_HIGH,
    color: '#1976d2',
    backgroundColor: '#1976d210',
    borderColor: '#1976d230',
    label: 'Very High',
    description: 'Very high confidence - auto-approve',
    needsReview: false
  }
};

/**
 * Get confidence level details for a given confidence score
 * @param {number} confidence - Confidence score (0-1)
 * @returns {Object} Confidence level object with properties
 */
function getConfidenceLevel(confidence) {
  if (confidence < CONFIDENCE_THRESHOLDS.VERY_LOW) return CONFIDENCE_LEVELS.very_low;
  if (confidence < CONFIDENCE_THRESHOLDS.LOW) return CONFIDENCE_LEVELS.low;
  if (confidence < CONFIDENCE_THRESHOLDS.MEDIUM) return CONFIDENCE_LEVELS.medium;
  if (confidence < CONFIDENCE_THRESHOLDS.HIGH) return CONFIDENCE_LEVELS.high;
  return CONFIDENCE_LEVELS.very_high;
}

/**
 * Check if email needs human review based on confidence
 * @param {number} confidence - Confidence score (0-1)
 * @returns {boolean} True if needs review
 */
function needsReview(confidence) {
  return confidence < CONFIDENCE_THRESHOLDS.NEEDS_REVIEW;
}

/**
 * Check if email can be auto-approved
 * @param {number} confidence - Confidence score (0-1) 
 * @returns {boolean} True if can auto-approve
 */
function canAutoApprove(confidence) {
  return confidence >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE;
}

/**
 * Get retention days for email based on confidence
 * @param {number} confidence - Confidence score (0-1)
 * @param {boolean} isJobRelated - Whether email is job-related
 * @returns {number} Days to retain email
 */
function getRetentionDays(confidence, isJobRelated = false) {
  // Job-related emails are kept permanently
  if (isJobRelated) return 0;
  
  // Non-job emails retention based on confidence
  if (confidence < CONFIDENCE_THRESHOLDS.LOW) {
    return CONFIDENCE_THRESHOLDS.VERY_UNCERTAIN_DAYS;
  }
  if (confidence < CONFIDENCE_THRESHOLDS.MEDIUM) {
    return CONFIDENCE_THRESHOLDS.UNCERTAIN_DAYS;  
  }
  return CONFIDENCE_THRESHOLDS.CERTAIN_DAYS;
}

/**
 * Check if confidence is high enough to store as job
 * @param {number} confidence - Confidence score (0-1)
 * @returns {boolean} True if should store as job
 */
function shouldStoreAsJob(confidence) {
  return confidence >= CONFIDENCE_THRESHOLDS.MIN_JOB_STORAGE;
}

module.exports = {
  CONFIDENCE_THRESHOLDS,
  CONFIDENCE_LEVELS,
  getConfidenceLevel,
  needsReview,
  canAutoApprove,
  getRetentionDays,
  shouldStoreAsJob
};