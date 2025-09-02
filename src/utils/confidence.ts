/**
 * Frontend Confidence Utilities
 * 
 * Mirrors the backend confidence-config.js for consistent UI treatment
 * of confidence scores across the application.
 */

// Standard confidence thresholds (0-1 scale) - must match backend
export const CONFIDENCE_THRESHOLDS = {
  VERY_LOW: 0.3,      // 0.0-0.3: Very low confidence, needs review
  LOW: 0.5,           // 0.3-0.5: Low confidence, needs review  
  MEDIUM: 0.7,        // 0.5-0.7: Medium confidence, optional review
  HIGH: 0.9,          // 0.7-0.9: High confidence, can auto-approve
  VERY_HIGH: 1.0,     // 0.9-1.0: Very high confidence, auto-approve
  
  // Functional thresholds
  NEEDS_REVIEW: 0.7,        // Below this = needs human review
  AUTO_APPROVE: 0.9,        // Above this = can auto-approve
};

// Confidence level definitions with UI properties
export interface ConfidenceLevel {
  level: string;
  threshold: number;
  color: string;
  backgroundColor: string;
  borderColor: string;
  label: string;
  description: string;
  needsReview: boolean;
}

export const CONFIDENCE_LEVELS: Record<string, ConfidenceLevel> = {
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
 * Get confidence level details for a given job probability score
 * @param job_probability - Job probability score (0-1)
 * @returns Confidence level object with UI properties
 */
export function getConfidenceLevel(job_probability: number): ConfidenceLevel {
  if (job_probability < CONFIDENCE_THRESHOLDS.VERY_LOW) return CONFIDENCE_LEVELS.very_low;
  if (job_probability < CONFIDENCE_THRESHOLDS.LOW) return CONFIDENCE_LEVELS.low;
  if (job_probability < CONFIDENCE_THRESHOLDS.MEDIUM) return CONFIDENCE_LEVELS.medium;
  if (job_probability < CONFIDENCE_THRESHOLDS.HIGH) return CONFIDENCE_LEVELS.high;
  return CONFIDENCE_LEVELS.very_high;
}

/**
 * Check if email needs human review based on job probability
 * @param job_probability - Job probability score (0-1)
 * @returns True if needs review
 */
export function needsReview(job_probability: number): boolean {
  return job_probability < CONFIDENCE_THRESHOLDS.NEEDS_REVIEW;
}

/**
 * Check if email can be auto-approved
 * @param job_probability - Job probability score (0-1) 
 * @returns True if can auto-approve
 */
export function canAutoApprove(job_probability: number): boolean {
  return job_probability >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE;
}

/**
 * Get Material-UI color name for confidence level
 * @param job_probability - Job probability score (0-1)
 * @returns MUI color name
 */
export function getConfidenceColor(job_probability: number): 'error' | 'warning' | 'success' | 'info' {
  const level = getConfidenceLevel(job_probability);
  switch (level.level) {
    case 'very_low':
    case 'low':
      return 'error';
    case 'medium':
      return 'warning';
    case 'high':
      return 'success';
    case 'very_high':
      return 'info';
    default:
      return 'error';
  }
}

/**
 * Get readable label for confidence level
 * @param job_probability - Job probability score (0-1)
 * @returns Human-readable label
 */
export function getConfidenceLabel(job_probability: number): string {
  return getConfidenceLevel(job_probability).label;
}

/**
 * Format job probability as percentage string
 * @param job_probability - Job probability score (0-1)
 * @returns Formatted percentage (e.g., "85%")
 */
export function formatConfidencePercent(job_probability: number): string {
  return `${Math.round(job_probability * 100)}%`;
}