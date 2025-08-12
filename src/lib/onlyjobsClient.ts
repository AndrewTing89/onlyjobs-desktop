export interface Job {
  id: string;
  company: string | null;
  position: string | null;
  status: string;
  email_id?: string;
  from_address?: string | null;
  received_at?: string | number | Date | null;
  match_score?: number | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: any;
}

export interface JobEmail {
  id: string;
  job_id?: string;
  email_id?: string;
  subject: string | null;
  from_address: string | null;
  received_at?: string | number | Date | null;
  snippet?: string | null;
  plaintext?: string | null;
  [k: string]: any;
}

export interface EmailDetail {
  id: string;
  subject: string | null;
  from_address: string | null;
  received_at?: string | number | Date | null;
  plaintext?: string | null;
  raw_content?: string | null;
  thread_id?: string | null;
  [k: string]: any;
}

type ElectronIPC = {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
};

declare global {
  interface Window {
    electron?: { ipc?: ElectronIPC };
  }
}

export async function listJobs(): Promise<Job[]> {
  try {
    if (window?.electronAPI?.getJobs) return await window.electronAPI.getJobs();
  } catch (e) {
    console.warn('electronAPI.getJobs failed:', e);
  }
  try {
    if (window?.electron?.ipc?.invoke) return await window.electron.ipc.invoke('db:get-jobs');
  } catch (e) {
    console.warn('IPC db:get-jobs failed:', e);
  }
  const base = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return [];
  try {
    const res = await fetch(`${base}/jobs`);
    return res.ok ? (await res.json()) : [];
  } catch (e) {
    console.warn('HTTP jobs fetch failed:', e);
    return [];
  }
}

export async function fetchJobInbox(jobId: string): Promise<JobEmail[]> {
  try {
    if (window?.electronAPI?.getJobInbox) return await window.electronAPI.getJobInbox(jobId);
  } catch (e) {
    console.warn('electronAPI.getJobInbox failed:', e);
  }
  try {
    if (window?.electron?.ipc?.invoke) return await window.electron.ipc.invoke('db:get-job-emails', { jobId });
  } catch (e) {
    console.warn('IPC db:get-job-emails failed:', e);
  }
  const base = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return [];
  try {
    const res = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}/emails`);
    return res.ok ? (await res.json()) : [];
  } catch (e) {
    console.warn('HTTP job emails fetch failed:', e);
    return [];
  }
}

export async function fetchEmailDetail(emailId: string): Promise<EmailDetail | null> {
  try {
    if (window?.electronAPI?.getEmailDetail) return await window.electronAPI.getEmailDetail(emailId);
  } catch (e) {
    console.warn('electronAPI.getEmailDetail failed:', e);
  }
  try {
    if (window?.electron?.ipc?.invoke) return await window.electron.ipc.invoke('db:get-email', { id: emailId });
  } catch (e) {
    console.warn('IPC db:get-email failed:', e);
  }
  const base = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  try {
    const res = await fetch(`${base}/emails/${encodeURIComponent(emailId)}`);
    return res.ok ? (await res.json()) : null;
  } catch (e) {
    console.warn('HTTP email detail fetch failed:', e);
    return null;
  }
}

// Compatibility wrapper for existing imports
export const onlyJobsClient = { listJobs, fetchJobInbox, fetchEmailDetail };
export default onlyJobsClient;