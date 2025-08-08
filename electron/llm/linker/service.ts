import Database from "better-sqlite3";
import crypto from "crypto";
import { EmailFeatures, extractEmailFeatures } from "./features";
import { ExistingApplication, LinkingScore, scoreApplicationMatch, generateRoleKey, shouldUpgradeRoleKey } from "./score";

export class ApplicationLinker {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // Generate a unique application ID
  private generateApplicationId(): string {
    return crypto.randomUUID();
  }

  // Generate a unique event ID
  private generateEventId(): string {
    return crypto.randomUUID();
  }

  // Get existing applications for a company
  private getExistingApplications(companyCanon: string): ExistingApplication[] {
    const stmt = this.db.prepare(`
      SELECT 
        application_id as applicationId,
        company,
        position,
        role_key as roleKey,
        ats_portal as atsPortal,
        ats_job_id as atsJobId,
        req_id as reqId,
        position_fingerprint as positionFingerprint,
        content_fingerprint as contentFingerprint,
        created_at as createdAt,
        last_updated_at as lastUpdatedAt
      FROM applications 
      WHERE company = ?
      ORDER BY last_updated_at DESC
    `);
    
    return stmt.all(companyCanon) as ExistingApplication[];
  }

  // Find best matching application
  private findBestMatch(applications: ExistingApplication[], features: EmailFeatures): {
    application: ExistingApplication | null;
    score: LinkingScore;
  } {
    let bestScore: LinkingScore = { score: 0, reason: 'No candidates', linkageReason: 'no_link' };
    let bestApplication: ExistingApplication | null = null;

    for (const app of applications) {
      const score = scoreApplicationMatch(app, features);
      
      if (score.score > bestScore.score) {
        bestScore = score;
        bestApplication = app;
      }
    }

    return { application: bestApplication, score: bestScore };
  }

  // Create new application
  private createApplication(features: EmailFeatures, status?: string): string {
    const applicationId = this.generateApplicationId();
    const roleKey = generateRoleKey(features);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO applications (
        application_id, company, position, role_key, ats_portal, ats_job_id, 
        req_id, position_fingerprint, content_fingerprint, location, team,
        current_status, created_at, last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      applicationId,
      features.companyCanon,
      features.titleNorm || null,
      roleKey,
      features.atsPortal || null,
      features.atsJobId || null,
      features.reqId || null,
      features.titleFP || null,
      features.contentFP,
      null, // location - to be extracted later
      null, // team - to be extracted later
      status || null,
      now,
      now
    );

    return applicationId;
  }

  // Update existing application with new evidence
  private updateApplication(applicationId: string, features: EmailFeatures, status?: string): void {
    const currentApp = this.db.prepare(`
      SELECT role_key, ats_portal, ats_job_id, req_id, position_fingerprint, position
      FROM applications WHERE application_id = ?
    `).get(applicationId) as any;

    if (!currentApp) return;

    const newRoleKey = generateRoleKey(features);
    const shouldUpgrade = shouldUpgradeRoleKey(currentApp.role_key || '', newRoleKey);
    
    let updateFields: any = {
      last_updated_at: Date.now()
    };

    // Update status if provided
    if (status) {
      updateFields.current_status = status;
    }

    // Upgrade role key and related fields if we have stronger evidence
    if (shouldUpgrade) {
      updateFields.role_key = newRoleKey;
      
      if (features.atsPortal) updateFields.ats_portal = features.atsPortal;
      if (features.atsJobId) updateFields.ats_job_id = features.atsJobId;
      if (features.reqId) updateFields.req_id = features.reqId;
      if (features.titleFP) updateFields.position_fingerprint = features.titleFP;
      
      // Update position if we didn't have one before or if we have stronger evidence
      if (!currentApp.position && features.titleNorm) {
        updateFields.position = features.titleNorm;
      }
    }

    // Build dynamic update query
    const fields = Object.keys(updateFields);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = Object.values(updateFields);
    
    const stmt = this.db.prepare(`UPDATE applications SET ${setClause} WHERE application_id = ?`);
    stmt.run(...values, applicationId);

    // Check if we need to merge with another application due to role key upgrade
    if (shouldUpgrade && updateFields.role_key) {
      this.checkAndMergeApplications(applicationId, features.companyCanon, updateFields.role_key);
    }
  }

  // Check for duplicate applications and merge if necessary
  private checkAndMergeApplications(primaryAppId: string, company: string, roleKey: string): void {
    const duplicates = this.db.prepare(`
      SELECT application_id 
      FROM applications 
      WHERE company = ? AND role_key = ? AND application_id != ?
    `).all(company, roleKey, primaryAppId) as { application_id: string }[];

    for (const duplicate of duplicates) {
      this.mergeApplications(primaryAppId, duplicate.application_id);
    }
  }

  // Merge two applications
  private mergeApplications(primaryAppId: string, duplicateAppId: string): void {
    const transaction = this.db.transaction(() => {
      // Move email links
      this.db.prepare(`
        UPDATE email_to_application 
        SET application_id = ?, linkage_reason = 'auto_merge'
        WHERE application_id = ?
      `).run(primaryAppId, duplicateAppId);

      // Move events
      this.db.prepare(`
        UPDATE application_events 
        SET application_id = ?, linkage_reason = 'auto_merge'
        WHERE application_id = ?
      `).run(primaryAppId, duplicateAppId);

      // Delete duplicate application
      this.db.prepare(`DELETE FROM applications WHERE application_id = ?`).run(duplicateAppId);
    });

    transaction();
  }

  // Link email to application
  private linkEmailToApplication(
    gmailMessageId: string, 
    applicationId: string, 
    score: LinkingScore
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO email_to_application (
        gmail_message_id, application_id, confidence, linkage_reason, linked_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(gmailMessageId, applicationId, score.score, score.linkageReason, Date.now());
  }

  // Create application event
  private createApplicationEvent(
    applicationId: string,
    gmailMessageId: string,
    subject: string,
    status: string | null,
    messageDate: number,
    linkageReason?: string
  ): void {
    const eventId = this.generateEventId();
    
    const stmt = this.db.prepare(`
      INSERT INTO application_events (
        event_id, application_id, gmail_message_id, event_type, 
        status, event_date, subject, linkage_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const eventType = status || 'communication';
    
    stmt.run(
      eventId,
      applicationId,
      gmailMessageId,
      eventType,
      status,
      messageDate,
      subject,
      linkageReason || null
    );
  }

  // Main linking function
  public linkEmail(
    gmailMessageId: string,
    company: string | null,
    position: string | null,
    status: string | null,
    subject: string,
    bodyText: string,
    fromEmail: string,
    headers: Array<{ name: string; value: string }>,
    threadId?: string,
    messageDate?: number,
    toEmails?: string[],
    ccEmails?: string[]
  ): string {
    // Extract features
    const features = extractEmailFeatures(
      company, position, subject, bodyText, fromEmail, 
      headers, threadId, messageDate, toEmails, ccEmails
    );

    // Get existing applications for this company
    const existingApps = this.getExistingApplications(features.companyCanon);

    let applicationId: string;
    let linkageReason: string;

    if (existingApps.length === 0) {
      // No existing applications for this company - create new one
      applicationId = this.createApplication(features, status || undefined);
      linkageReason = 'auto_link';
    } else {
      // Find best match
      const { application, score } = this.findBestMatch(existingApps, features);

      if (score.linkageReason === 'no_link' || !application) {
        // Create new application
        applicationId = this.createApplication(features, status || undefined);
        linkageReason = 'auto_link';
      } else {
        // Link to existing application
        applicationId = application.applicationId;
        linkageReason = score.linkageReason;
        
        // Update application with new evidence
        this.updateApplication(applicationId, features, status || undefined);
      }
    }

    // Create linkage and event records
    const linkingScore: LinkingScore = {
      score: 1.0,
      reason: 'Direct link',
      linkageReason: linkageReason as any
    };

    this.linkEmailToApplication(gmailMessageId, applicationId, linkingScore);
    this.createApplicationEvent(
      applicationId, 
      gmailMessageId, 
      subject, 
      status, 
      messageDate || Date.now(),
      linkageReason
    );

    return applicationId;
  }

  // Get application timeline
  public getApplicationTimeline(applicationId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT 
        ae.event_date,
        ae.event_type,
        ae.status,
        ae.subject,
        ae.linkage_reason,
        je.company,
        je.position,
        je.from_email
      FROM application_events ae
      JOIN job_emails je ON ae.gmail_message_id = je.gmail_message_id
      WHERE ae.application_id = ?
      ORDER BY ae.event_date ASC
    `);

    return stmt.all(applicationId);
  }

  // Get all applications with stats
  public getAllApplicationsWithStats(): any[] {
    const stmt = this.db.prepare(`
      SELECT 
        a.application_id,
        a.company,
        a.position,
        a.role_key,
        a.current_status,
        a.created_at,
        a.last_updated_at,
        COUNT(eta.gmail_message_id) as email_count,
        MIN(ae.event_date) as first_activity,
        MAX(ae.event_date) as last_activity
      FROM applications a
      LEFT JOIN email_to_application eta ON a.application_id = eta.application_id
      LEFT JOIN application_events ae ON a.application_id = ae.application_id
      GROUP BY a.application_id
      ORDER BY a.last_updated_at DESC
    `);

    return stmt.all();
  }
}