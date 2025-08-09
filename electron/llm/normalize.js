"use strict";
/**
 * Normalization helpers for LLM output consistency
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanText = exports.normalizeStatus = void 0;

function normalizeStatus(s) {
  if (!s || typeof s !== 'string') return null;
  
  const cleaned = s.toLowerCase().trim();
  if (!cleaned) return null;
  
  // Map common variants
  if (cleaned.includes('screening') || 
      cleaned.includes('phone screen') || 
      cleaned.includes('hr screen') || 
      cleaned.includes('onsite') || 
      cleaned.includes('tech screen') || 
      cleaned.includes('interview')) {
    return 'Interview';
  }
  
  if (cleaned.includes('submitted') || 
      cleaned.includes('application received') || 
      cleaned.includes('applied')) {
    return 'Applied';
  }
  
  if (cleaned.includes('reject') || 
      cleaned.includes('declined') || 
      cleaned.includes('no longer considered')) {
    return 'Declined';
  }
  
  if (cleaned.includes('offer') || 
      cleaned.includes('verbal offer')) {
    return 'Offer';
  }
  
  // Direct matches
  const directMap = {
    'applied': 'Applied',
    'interview': 'Interview', 
    'declined': 'Declined',
    'offer': 'Offer'
  };
  
  return directMap[cleaned] || null;
}
exports.normalizeStatus = normalizeStatus;

function cleanText(s) {
  if (!s || typeof s !== 'string') return null;
  
  let cleaned = s.trim();
  if (!cleaned) return null;
  
  // Strip enclosing quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  return cleaned || null;
}
exports.cleanText = cleanText;