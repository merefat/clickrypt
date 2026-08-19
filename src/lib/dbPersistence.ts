import fs from 'fs';
import path from 'path';
import { supabase } from './supabase';

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

let persistTimer: NodeJS.Timeout | null = null;

function getStorageShape(db: any) {
  return {
    users: db.users || [],
    folders: db.folders || [],
    resources: db.resources || [],
    groups: db.groups || [],
    auditLogs: db.auditLogs || [],
    subscription: db.subscription || null,
    invitations: db.invitations || [],
    ssoSettings: db.ssoSettings || [],
    ssoKeys: db.ssoKeys || [],
    ssoStates: db.ssoStates || [],
    ssoTokens: db.ssoTokens || [],
    authChallenges: db.authChallenges || [],
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
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          const keys = Object.keys(getStorageShape(db));
          for (const key of keys) {
            if (data[key] !== undefined && db[key] !== undefined) {
              if (Array.isArray(db[key])) {
                db[key].splice(0, db[key].length, ...data[key]);
              } else {
                Object.assign(db[key], data[key]);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('DB file load warning:', err);
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
