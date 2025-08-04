// api.types.ts
export interface ApiResponse<T> {
    data: T;
    error: string | null;
    status: number;
  }
  
  export interface JobApplication {
    id: string;
    userId: string;
    company: string;
    jobTitle: string;
    location: string;
    status: 'Applied' | 'Interviewed' | 'Offer' | 'Declined';
    appliedDate: Date;
    lastUpdated: Date;
    source: 'gmail' | 'manual';
    emailId?: string;
  }
  
  export interface DashboardStats {
    totalApplications: number;
    responseRate: number;
    interviewRate: number;
    offerRate: number;
    applicationsLast7Days: number;
    applicationsLast30Days: number;
  }
  
  export interface GmailSyncRequest {
    userId?: string;
    uid?: string;
    backfill?: boolean;
    syncHours?: number;
  }
  
  export interface GmailSyncResponse {
    status: 'success' | 'error';
    processed: number;
    message: string;
  }