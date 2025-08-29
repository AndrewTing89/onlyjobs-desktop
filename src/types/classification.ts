export interface EmailClassification {
  id: string;
  email_id: string;
  from_address: string;
  subject: string;
  received_date: string;
  account_email: string;
  thread_id?: string;
  
  // ML Classification results
  ml_confidence: number; // 0-100
  is_job_related: boolean;
  
  // Extracted job information (if applicable)
  company?: string;
  position?: string;
  status?: 'Applied' | 'Interview' | 'Offer' | 'Declined';
  
  // Human review status
  review_status: 'needs_review' | 'approved' | 'rejected' | 'queued_for_parsing';
  reviewed_by?: string;
  reviewed_at?: string;
  
  // Processing metadata
  created_at: string;
  updated_at: string;
  raw_content?: string;
  processed_at?: string;
}

export interface ClassificationFilters {
  confidence_min?: number;
  confidence_max?: number;
  review_status?: EmailClassification['review_status'][];
  is_job_related?: boolean;
  date_from?: string;
  date_to?: string;
  search_query?: string;
  account_email?: string;
}

export interface BulkOperationRequest {
  email_ids: string[];
  operation: 'approve_as_job' | 'reject_as_not_job' | 'queue_for_parsing' | 'mark_needs_review';
  metadata?: {
    company?: string;
    position?: string;
    status?: EmailClassification['status'];
  };
}

export interface ClassificationStats {
  total_emails: number;
  needs_review: number;
  high_confidence_jobs: number;
  rejected: number;
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
    label: 'Low Confidence'
  },
  medium: {
    level: 'medium',
    color: '#ff9800',
    backgroundColor: '#ff980020',
    borderColor: '#ff980040',
    label: 'Medium Confidence'
  },
  high: {
    level: 'high',
    color: '#4caf50',
    backgroundColor: '#4caf5020',
    borderColor: '#4caf5040',
    label: 'High Confidence'
  }
};

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence < 30) return CONFIDENCE_LEVELS.low;
  if (confidence < 70) return CONFIDENCE_LEVELS.medium;
  return CONFIDENCE_LEVELS.high;
}