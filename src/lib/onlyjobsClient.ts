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

// Type declarations are in src/electron.d.ts

export class OnlyJobsClient {
  private api = window.electronAPI?.onlyjobs;
  private isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  constructor() {
    // Don't throw error in constructor - let individual methods handle it
  }

  private ensureElectron(): void {
    if (!this.isElectron || !this.api) {
      throw new Error('OnlyJobs IPC API not available - this feature requires Electron environment');
    }
  }

  async fetchJobInbox(options?: {
    status?: 'Applied' | 'Interview' | 'Declined' | 'Offer';
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<JobEmail>> {
    this.ensureElectron();
    return this.api.fetchJobInbox(options);
  }

  async fetchEmailDetail(gmailMessageId: string): Promise<EmailDetail> {
    this.ensureElectron();
    return this.api.fetchEmailDetail({ gmail_message_id: gmailMessageId });
  }

  async fetchApplications(options?: {
    company?: string;
    status?: 'Applied' | 'Interview' | 'Declined' | 'Offer';
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Application>> {
    this.ensureElectron();
    return this.api.fetchApplications(options);
  }

  async fetchApplicationTimeline(applicationId: string): Promise<ApplicationTimeline> {
    this.ensureElectron();
    return this.api.fetchApplicationTimeline({ application_id: applicationId });
  }

  isAvailable(): boolean {
    return this.isElectron && !!this.api;
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