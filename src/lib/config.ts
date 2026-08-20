/**
 * Clickrypt Global Configuration & Feature Flags
 */

// Toggle to enable/disable Pay Bill options & Stripe payment gates
export const ENABLE_PAY_BILL = false;

export const BLOCKED_ORG_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
  'live.com',
  'mail.com',
  'proton.me',
  'protonmail.com',
  'yandex.com',
  'qq.com',
  '163.com',
  '126.com',
  'foxmail.com',
  'zoho.com',
  'hey.com',
  'pm.me',
]);

export const RP_NAME = 'Clickrypt Zero-Knowledge Vault';
export const RP_ID = process.env.NEXT_PUBLIC_RP_ID || process.env.RP_ID || 'localhost';

export function isAllowedOrgEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !BLOCKED_ORG_EMAIL_DOMAINS.has(domain);
}

export function normalizeOrganizationDomain(domain: string): string {
  return domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

export function matchesOrganizationDomain(email: string, orgDomain: string): boolean {
  const normalizedOrg = normalizeOrganizationDomain(orgDomain);
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (!emailDomain || !normalizedOrg) return false;
  if (BLOCKED_ORG_EMAIL_DOMAINS.has(emailDomain)) return false;
  return emailDomain === normalizedOrg;
}

export const VERIFICATION_CODE_EXPIRY_MINUTES = 15;
export const VERIFICATION_CODE_LENGTH = 6;
