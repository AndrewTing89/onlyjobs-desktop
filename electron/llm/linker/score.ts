import { EmailFeatures, titleSimilarity } from "./features";

export type LinkingScore = {
  score: number;
  reason: string;
  linkageReason: 'auto_link' | 'needs_review' | 'no_link' | 'auto_merge';
};

export type ExistingApplication = {
  applicationId: string;
  company: string;
  position?: string;
  roleKey?: string;
  atsPortal?: string;
  atsJobId?: string;
  reqId?: string;
  positionFingerprint?: string;
  contentFingerprint?: string;
  createdAt: number;
  lastUpdatedAt: number;
};

const DAYS_120 = 120 * 24 * 60 * 60 * 1000; // 120 days in milliseconds

export function scoreApplicationMatch(
  existingApp: ExistingApplication, 
  emailFeatures: EmailFeatures
): LinkingScore {
  let score = 0;
  const reasons: string[] = [];
  
  // Strong positive signals (can short-circuit)
  
  // Same ATS Job ID - strongest signal
  if (existingApp.atsJobId && emailFeatures.atsJobId) {
    if (existingApp.atsJobId === emailFeatures.atsJobId) {
      return {
        score: 1.0,
        reason: `Same ATS job ID: ${emailFeatures.atsJobId}`,
        linkageReason: 'auto_link'
      };
    } else {
      // Different ATS job IDs - hard negative
      return {
        score: 0,
        reason: `Different ATS job IDs: ${existingApp.atsJobId} vs ${emailFeatures.atsJobId}`,
        linkageReason: 'no_link'
      };
    }
  }
  
  // Same requisition ID
  if (existingApp.reqId && emailFeatures.reqId) {
    if (existingApp.reqId === emailFeatures.reqId) {
      score += 0.90;
      reasons.push(`Same req ID: ${emailFeatures.reqId}`);
    } else {
      // Different req IDs - hard negative
      return {
        score: 0,
        reason: `Different req IDs: ${existingApp.reqId} vs ${emailFeatures.reqId}`,
        linkageReason: 'no_link'
      };
    }
  }
  
  // Same position fingerprint
  if (existingApp.positionFingerprint && emailFeatures.titleFP) {
    if (existingApp.positionFingerprint === emailFeatures.titleFP) {
      score += 0.75;
      reasons.push('Same position fingerprint');
    } else {
      // Different position fingerprints - strong negative
      score -= 0.50;
      reasons.push('Different position fingerprints');
    }
  }
  
  // Same content fingerprint (for position-less emails)
  if (existingApp.contentFingerprint && emailFeatures.contentFP) {
    const timeDiff = Math.abs(emailFeatures.messageDate - existingApp.lastUpdatedAt);
    if (existingApp.contentFingerprint === emailFeatures.contentFP && timeDiff <= DAYS_120) {
      score += 0.65;
      reasons.push('Same content fingerprint within 120 days');
    }
  }
  
  // Thread continuity
  if (emailFeatures.threadId) {
    // We'd need to check if any emails in this application share the thread ID
    // For now, we'll implement this as a moderate positive signal
    score += 0.60;
    reasons.push('Thread continuity');
  }
  
  // Title similarity
  if (existingApp.position && emailFeatures.titleNorm) {
    const similarity = titleSimilarity(existingApp.position, emailFeatures.titleNorm);
    if (similarity >= 0.85) {
      score += 0.30;
      reasons.push(`High title similarity: ${(similarity * 100).toFixed(1)}%`);
    } else if (similarity >= 0.60) {
      score += 0.15;
      reasons.push(`Moderate title similarity: ${(similarity * 100).toFixed(1)}%`);
    }
  }
  
  // Participant/ATS portal overlap
  if (existingApp.atsPortal && emailFeatures.atsPortal) {
    if (existingApp.atsPortal === emailFeatures.atsPortal) {
      score += 0.10;
      reasons.push(`Same ATS portal: ${emailFeatures.atsPortal}`);
    }
  }
  
  // Domain overlap (simplified - just check if we have recruiting domains)
  const recruitingDomains = emailFeatures.participants.filter(domain => 
    domain.includes('greenhouse.io') || 
    domain.includes('lever.co') || 
    domain.includes('workday.com') ||
    domain.includes('smartrecruiters.com') ||
    domain.includes('icims.com') ||
    domain.includes('bamboohr.com')
  );
  
  if (recruitingDomains.length > 0) {
    score += 0.05;
    reasons.push('Recruiting platform domain detected');
  }
  
  // Determine linking decision
  const reasonText = reasons.length > 0 ? reasons.join(', ') : 'No matching signals';
  
  if (score >= 0.80) {
    return {
      score,
      reason: reasonText,
      linkageReason: 'auto_link'
    };
  } else if (score >= 0.60) {
    return {
      score,
      reason: reasonText,
      linkageReason: 'needs_review'
    };
  } else {
    return {
      score,
      reason: reasonText,
      linkageReason: 'no_link'
    };
  }
}

export function generateRoleKey(features: EmailFeatures): string {
  // Priority order for role key generation
  if (features.atsJobId) {
    return `ats:${features.atsPortal}:${features.atsJobId}`;
  }
  
  if (features.reqId) {
    return `req:${features.reqId}`;
  }
  
  if (features.titleFP) {
    return `title:${features.titleFP}`;
  }
  
  return `content:${features.contentFP}`;
}

export function shouldUpgradeRoleKey(currentKey: string, newKey: string): boolean {
  // ATS job ID always wins
  if (newKey.startsWith('ats:')) return true;
  if (currentKey.startsWith('ats:')) return false;
  
  // Req ID beats title and content
  if (newKey.startsWith('req:')) return !currentKey.startsWith('req:');
  if (currentKey.startsWith('req:')) return false;
  
  // Title beats content
  if (newKey.startsWith('title:')) return currentKey.startsWith('content:');
  
  return false;
}