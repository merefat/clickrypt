import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabase } from './supabase';

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

let persistTimer: NodeJS.Timeout | null = null;

function getStorageShape(db: any) {
  return {
    users: db.users || [],
    folders: db.folders || [],
    resources: db.resources || [],
    organizationResources: db.organizationResources || [],
    organizationFolders: db.organizationFolders || [],
    organizationAuditLogs: db.organizationAuditLogs || [],
    groups: db.groups || [],
    auditLogs: db.auditLogs || [],
    subscription: db.subscription || null,
    invitations: db.invitations || [],
    ssoSettings: db.ssoSettings || [],
    ssoKeys: db.ssoKeys || [],
    ssoStates: db.ssoStates || [],
    ssoTokens: db.ssoTokens || [],
    authChallenges: db.authChallenges || [],
    passkeyChallenges: db.passkeyChallenges || [],
    organizations: db.organizations || [],
    accountRecoveryPolicies: db.accountRecoveryPolicies || [],
    accountRecoveryOrgPublicKeys: db.accountRecoveryOrgPublicKeys || [],
    accountRecoveryUserSettings: db.accountRecoveryUserSettings || [],
    accountRecoveryPrivateKeys: db.accountRecoveryPrivateKeys || [],
    accountRecoveryPrivateKeyPasswords: db.accountRecoveryPrivateKeyPasswords || [],
    accountRecoveryRequests: db.accountRecoveryRequests || [],
    accountRecoveryResponses: db.accountRecoveryResponses || [],
  };
}

export function loadDbSync(db: any) {
  // Skip filesystem and network operations during Next.js static build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  // 1. Try local JSON file first (always works, even if Supabase isn't configured)
  let loadedData: any = null;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      if (raw && raw.trim()) {
        loadedData = JSON.parse(raw);
        if (loadedData && typeof loadedData === 'object') {
          const keys = Object.keys(getStorageShape(db));
          for (const key of keys) {
            if (loadedData[key] !== undefined && db[key] !== undefined) {
              if (Array.isArray(db[key])) {
                db[key].splice(0, db[key].length, ...loadedData[key]);
              } else {
                Object.assign(db[key], loadedData[key]);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('DB file load warning:', err);
  }

  // 1b. One-time migration: split legacy mixed-mode arrays into personal/organization arrays
  const migrateByMode = <T extends { mode?: 'personal' | 'organization' }>(
    legacy: T[],
    personalTarget: T[],
    orgTarget: T[],
    defaultMode: 'personal' | 'organization' = 'personal'
  ) => {
    if (!legacy || legacy.length === 0) return;
    const toPersonal: T[] = [];
    const toOrg: T[] = [];
    for (const item of legacy) {
      if ((item.mode || defaultMode) === 'organization') {
        toOrg.push(item);
      } else {
        toPersonal.push(item);
      }
    }
    personalTarget.splice(0, personalTarget.length, ...toPersonal);
    orgTarget.splice(0, orgTarget.length, ...toOrg);
    legacy.length = 0;
  };

  const legacyResourceWasLoaded = loadedData?.resources && Array.isArray(loadedData.resources) && loadedData.resources.length > 0;
  if (legacyResourceWasLoaded) {
    migrateByMode(loadedData.resources as any[], db.resources, db.organizationResources, 'personal');
  }

  const legacyFolderWasLoaded = loadedData?.folders && Array.isArray(loadedData.folders) && loadedData.folders.length > 0;
  if (legacyFolderWasLoaded) {
    migrateByMode(loadedData.folders as any[], db.folders, db.organizationFolders, 'personal');
  }

  const legacyAuditWasLoaded = loadedData?.auditLogs && Array.isArray(loadedData.auditLogs) && loadedData.auditLogs.length > 0;
  if (legacyAuditWasLoaded) {
    migrateByMode(loadedData.auditLogs as any[], db.auditLogs, db.organizationAuditLogs, 'personal');
  }

  // 1c. Backfill missing accountMode for legacy users (default to organization to match prior defaults)
  for (const user of db.users) {
    if (!user.accountMode) {
      user.accountMode = 'organization';
    }
  }

  // 1d. Backfill existing users into default verified organizations
  for (const user of db.users) {
    if (!user.organizationId) {
      const domain = user.email.split('@')[1]?.toLowerCase() || 'default';
      let org = db.organizations.find((o: any) => o.domain === domain);
      if (!org) {
        org = {
          id: `org-${crypto.randomUUID()}`,
          domain,
          ownerId: user.id,
          createdAt: new Date().toISOString(),
          verificationStatus: 'verified',
          openEnrollment: false,
        };
        db.organizations.push(org);
      }
      user.organizationId = org.id;
    }
  }

  // 2. If Supabase is configured, try to load from there too (overwrites local if newer)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasRealCredentials =
    supabaseUrl &&
    !supabaseUrl.includes('xyzsupabasedemo') &&
    supabaseKey &&
    !supabaseKey.includes('SampleSupabase');

  if (hasRealCredentials) {
    Promise.resolve(
      supabase.from('db_snapshot').select('data').eq('key', 'default').single()
    )
      .then(({ data, error }) => {
        if (error || !data?.data) return;
        try {
          const remote = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
          const keys = Object.keys(getStorageShape(db));
          for (const key of keys) {
            if (remote[key] !== undefined && db[key] !== undefined) {
              if (Array.isArray(db[key])) {
                db[key].splice(0, db[key].length, ...remote[key]);
              } else {
                Object.assign(db[key], remote[key]);
              }
            }
          }
        } catch (e) {
          console.warn('Supabase snapshot parse error:', e);
        }
      })
      .catch(() => {});
  }
}

export function persistDb(db: any) {
  // Skip filesystem and network operations during Next.js static build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  const payload = getStorageShape(db);

  // 1. Save to local JSON file (works without any external setup)
  try {
    if (!fs.existsSync(path.dirname(DB_FILE))) {
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn('DB file write warning:', err);
  }

  // 2. If Supabase is configured, save to the db_snapshot table
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasRealCredentials =
    supabaseUrl &&
    !supabaseUrl.includes('xyzsupabasedemo') &&
    supabaseKey &&
    !supabaseKey.includes('SampleSupabase');

  if (hasRealCredentials) {
    Promise.resolve(
      supabase.from('db_snapshot').upsert({
        key: 'default',
        data: JSON.stringify(payload),
        updated_at: new Date().toISOString(),
      })
    )
      .then(({ error }) => {
        if (error) console.warn('Supabase save warning:', error);
      })
      .catch(() => {});
  }
}

export function schedulePersist(db: any) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistDb(db), 300);
}
