export interface EmailClassification {
  id: string;
  gmail_message_id: string;
  from_address: string;
  subject: string;
  date_received: string; // Maps to backend's email_date field
  account_email: string;
  thread_id?: string;
  
  // Email content
  plaintext: string; // Maps to backend's body field
  body_html?: string;
  
  // ML Classification results
  ml_classification?: string; // JSON string of classification result
  job_probability: number; // 0-1 probability that email is job-related (unified confidence field)
  is_job_related: boolean;
  is_classified: boolean;
  
  // Pipeline workflow stages
  pipeline_stage: 'fetched' | 'classified' | 'ready_for_extraction' | 'extracted' | 'in_jobs';
  classification_method?: 'digest_filter' | 'ml' | 'llm' | 'human' | 'rule_based';
  
  // Extracted job information (if applicable)
  company?: string;
  position?: string;
  status?: 'Applied' | 'Interview' | 'Offer' | 'Declined';
  
  // Links and metadata
  jobs_table_id?: string;
  needs_review?: boolean;
  review_reason?: string;
  user_feedback?: string;
  
  // User review tracking
  user_classification?: 'HIL_approved' | 'HIL_rejected';
  reviewed_at?: string;
  reviewed_by?: string;
  
  // Processing metadata
  created_at: string;
  updated_at: string;
}

export interface ClassificationFilters {
  confidence_min?: number;
  confidence_max?: number;
  pipeline_stage?: EmailClassification['pipeline_stage'][];
  classification_method?: EmailClassification['classification_method'][];
  is_job_related?: boolean;
  is_classified?: boolean;
  needs_review?: boolean;
  date_from?: string;
  date_to?: string;
  search_query?: string;
  account_email?: string;
}

export interface BulkOperationRequest {
  email_ids: string[];
  operation: 'approve_for_extraction' | 'reject_as_not_job' | 'mark_needs_review' | 'mark_reviewed';
  metadata?: {
    user_classification?: 'HIL_approved' | 'HIL_rejected';
    pipeline_stage?: EmailClassification['pipeline_stage'];
    user_feedback?: string;
  };
}

export interface ClassificationStats {
  total_emails: number;
  needs_review: number;
  job_opportunities: number;
  non_job_opportunities: number;
  queued_for_parsing: number;
  avg_confidence: number;
}

export interface ConfidenceLevel {
  level: 'low' | 'medium' | 'high';
  color: string;
  backgroundColor: string;
  borderColor: string;
  label: string;
}

export const CONFIDENCE_LEVELS: Record<string, ConfidenceLevel> = {
  low: {
    level: 'low',
    color: '#f44336',
    backgroundColor: '#f4433620',
    borderColor: '#f4433640',
    label: 'Low Probability'
  },
  medium: {
    level: 'medium',
    color: '#ff9800',
    backgroundColor: '#ff980020',
    borderColor: '#ff980040',
    label: 'Medium Probability'
  },
  high: {
    level: 'high',
    color: '#4caf50',
    backgroundColor: '#4caf5020',
    borderColor: '#4caf5040',
    label: 'High Probability'
  }
};

export function getConfidenceLevel(job_probability: number): ConfidenceLevel {
  if (job_probability < 0.3) return CONFIDENCE_LEVELS.low;
  if (job_probability < 0.7) return CONFIDENCE_LEVELS.medium;
  return CONFIDENCE_LEVELS.high;
}