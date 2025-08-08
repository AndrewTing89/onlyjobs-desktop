import { ipcMain } from "electron";
import Database from "better-sqlite3";
import path from "path";
import { getDbPath } from "../llm/config";

export function registerJobInboxHandlers() {
  // Fetch job inbox with optional filtering
  ipcMain.handle('onlyjobs.fetchJobInbox', async (event, { status, limit = 50, offset = 0 } = {}) => {
    const db = new Database(getDbPath());
    
    try {
      let whereClause = '';
      let params: any[] = [];
      
      if (status) {
        whereClause = 'WHERE status = ?';
        params.push(status);
      }
      
      // Get total count
      const countStmt = db.prepare(`
        SELECT COUNT(*) as total 
        FROM job_emails 
        ${whereClause}
      `);
      const { total } = countStmt.get(...params) as { total: number };
      
      // Get rows with pagination
      const dataStmt = db.prepare(`
        SELECT 
          gmail_message_id,
          subject,
          company,
          position,
          status,
          message_date,
          from_email,
          parsed_at
        FROM job_emails 
        ${whereClause}
        ORDER BY message_date DESC 
        LIMIT ? OFFSET ?
      `);
      
      const rows = dataStmt.all(...params, limit, offset);
      
      return { rows, total };
    } finally {
      db.close();
    }
  });

  // Fetch email detail with body
  ipcMain.handle('onlyjobs.fetchEmailDetail', async (event, { gmail_message_id }) => {
    const db = new Database(getDbPath());
    
    try {
      // Get email metadata
      const metaStmt = db.prepare(`
        SELECT 
          gmail_message_id,
          subject,
          company,
          position,
          status,
          message_date,
          thread_id,
          from_email,
          parsed_at,
          model_name,
          prompt_version,
          rule_hint_used,
          confidence
        FROM job_emails 
        WHERE gmail_message_id = ?
      `);
      
      const meta = metaStmt.get(gmail_message_id);
      
      if (!meta) {
        throw new Error(`Email not found: ${gmail_message_id}`);
      }
      
      // Get email body
      const bodyStmt = db.prepare(`
        SELECT 
          body_plain,
          body_html,
          body_excerpt,
          stored_at
        FROM job_email_bodies 
        WHERE gmail_message_id = ?
      `);
      
      const body = bodyStmt.get(gmail_message_id);
      
      return { meta, body };
    } finally {
      db.close();
    }
  });

  // Fetch applications with stats
  ipcMain.handle('onlyjobs.fetchApplications', async (event, { company, status, limit = 50, offset = 0 } = {}) => {
    const db = new Database(getDbPath());
    
    try {
      let whereClause = '';
      let params: any[] = [];
      
      const conditions: string[] = [];
      if (company) {
        conditions.push('a.company LIKE ?');
        params.push(`%${company}%`);
      }
      if (status) {
        conditions.push('a.current_status = ?');
        params.push(status);
      }
      
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
      
      // Get total count
      const countStmt = db.prepare(`
        SELECT COUNT(*) as total 
        FROM applications a
        ${whereClause}
      `);
      const { total } = countStmt.get(...params) as { total: number };
      
      // Get applications with event counts
      const dataStmt = db.prepare(`
        SELECT 
          a.application_id,
          a.company,
          a.position,
          a.role_key,
          a.ats_portal,
          a.ats_job_id,
          a.req_id,
          a.current_status,
          a.created_at,
          a.last_updated_at,
          COUNT(ae.event_id) as events_count,
          MIN(ae.event_date) as first_activity,
          MAX(ae.event_date) as last_activity
        FROM applications a
        LEFT JOIN application_events ae ON a.application_id = ae.application_id
        ${whereClause}
        GROUP BY a.application_id
        ORDER BY a.last_updated_at DESC 
        LIMIT ? OFFSET ?
      `);
      
      const rows = dataStmt.all(...params, limit, offset);
      
      return { rows, total };
    } finally {
      db.close();
    }
  });

  // Fetch application timeline
  ipcMain.handle('onlyjobs.fetchApplicationTimeline', async (event, { application_id }) => {
    const db = new Database(getDbPath());
    
    try {
      // Get application details
      const appStmt = db.prepare(`
        SELECT 
          application_id,
          company,
          position,
          role_key,
          ats_portal,
          ats_job_id,
          req_id,
          current_status,
          created_at,
          last_updated_at
        FROM applications 
        WHERE application_id = ?
      `);
      
      const application = appStmt.get(application_id);
      
      if (!application) {
        throw new Error(`Application not found: ${application_id}`);
      }
      
      // Get timeline events
      const eventsStmt = db.prepare(`
        SELECT 
          ae.event_id,
          ae.gmail_message_id,
          ae.event_type,
          ae.status,
          ae.event_date,
          ae.subject,
          ae.linkage_reason,
          je.company as email_company,
          je.position as email_position,
          je.from_email
        FROM application_events ae
        JOIN job_emails je ON ae.gmail_message_id = je.gmail_message_id
        WHERE ae.application_id = ?
        ORDER BY ae.event_date ASC
      `);
      
      const events = eventsStmt.all(application_id);
      
      return { application, events };
    } finally {
      db.close();
    }
  });
}