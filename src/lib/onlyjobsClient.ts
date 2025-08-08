// Type-safe client wrapper for OnlyJobs IPC calls

interface JobEmail {
  gmail_message_id: string;
  subject: string;
  company: string | null;
  position: string | null;
  status: 'Applied' | 'Interview' | 'Declined' | 'Offer' | null;
  message_date: number;
  from_email: string;
  parsed_at: number;
}

interface EmailBody {
  body_plain: string;
  body_html: string | null;
  body_excerpt: string;
  stored_at: number;
}

interface EmailDetail {
  meta: JobEmail & {
    thread_id: string | null;
    model_name: string | null;
    prompt_version: string | null;
    rule_hint_used: number;
    confidence: number | null;
  };
  body: EmailBody;
}

interface Application {
  application_id: string;
  company: string;
  position: string | null;
  role_key: string | null;
  ats_portal: string | null;
  ats_job_id: string | null;
  req_id: string | null;
  current_status: 'Applied' | 'Interview' | 'Declined' | 'Offer' | null;
  created_at: number;
  last_updated_at: number;
  events_count: number;
  first_activity: number;
  last_activity: number;
}

interface ApplicationEvent {
  event_id: string;
  gmail_message_id: string;
  event_type: string;
  status: 'Applied' | 'Interview' | 'Declined' | 'Offer' | null;
  event_date: number;
  subject: string;
  linkage_reason: string | null;
  email_company: string | null;
  email_position: string | null;
  from_email: string;
}

interface ApplicationTimeline {
  application: Omit<Application, 'events_count' | 'first_activity' | 'last_activity'>;
  events: ApplicationEvent[];
}

interface PaginatedResponse<T> {
  rows: T[];
  total: number;
}

// Get electronAPI from window
declare global {
  interface Window {
    electronAPI: {
      onlyjobs: {
        fetchJobInbox: (options?: {
          status?: 'Applied' | 'Interview' | 'Declined' | 'Offer';
          limit?: number;
          offset?: number;
        }) => Promise<PaginatedResponse<JobEmail>>;
        fetchEmailDetail: (options: {
          gmail_message_id: string;
        }) => Promise<EmailDetail>;
        fetchApplications: (options?: {
          company?: string;
          status?: 'Applied' | 'Interview' | 'Declined' | 'Offer';
          limit?: number;
          offset?: number;
        }) => Promise<PaginatedResponse<Application>>;
        fetchApplicationTimeline: (options: {
          application_id: string;
        }) => Promise<ApplicationTimeline>;
      };
    };
  }
}

export class OnlyJobsClient {
  private api = window.electronAPI?.onlyjobs;

  constructor() {
    if (!this.api) {
      throw new Error('OnlyJobs IPC API not available');
    }
  }

  async fetchJobInbox(options?: {
    status?: 'Applied' | 'Interview' | 'Declined' | 'Offer';
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<JobEmail>> {
    return this.api.fetchJobInbox(options);
  }

  async fetchEmailDetail(gmailMessageId: string): Promise<EmailDetail> {
    return this.api.fetchEmailDetail({ gmail_message_id: gmailMessageId });
  }

  async fetchApplications(options?: {
    company?: string;
    status?: 'Applied' | 'Interview' | 'Declined' | 'Offer';
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Application>> {
    return this.api.fetchApplications(options);
  }

  async fetchApplicationTimeline(applicationId: string): Promise<ApplicationTimeline> {
    return this.api.fetchApplicationTimeline({ application_id: applicationId });
  }
}

// Export types for use in components
export type {
  JobEmail,
  EmailBody,
  EmailDetail,
  Application,
  ApplicationEvent,
  ApplicationTimeline,
  PaginatedResponse
};

// Singleton instance
export const onlyJobsClient = new OnlyJobsClient();