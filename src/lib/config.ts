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

export function isAllowedOrgEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !BLOCKED_ORG_EMAIL_DOMAINS.has(domain);
}
