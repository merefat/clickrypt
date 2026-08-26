/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseServer } from './supabaseServer';

function isBuildPhase() {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

type ModeSplitTable = { table: string; personal: string; organization: string };

const MODE_SPLIT_TABLES: ModeSplitTable[] = [
  { table: 'folders', personal: 'folders', organization: 'organizationFolders' },
  { table: 'resources', personal: 'resources', organization: 'organizationResources' },
  { table: 'audit_logs', personal: 'auditLogs', organization: 'organizationAuditLogs' },
];

const SINGLE_TABLES = [
  'groups',
  'invitations',
  'passkey_challenges',
  'sso_settings',
  'sso_keys',
  'sso_states',
  'sso_tokens',
  'auth_challenges',
  'account_recovery_policies',
  'account_recovery_org_public_keys',
  'account_recovery_user_settings',
  'account_recovery_private_keys',
  'account_recovery_private_key_passwords',
  'account_recovery_requests',
  'account_recovery_responses',
];

export async function loadDb(db: any) {
  if (isBuildPhase()) {
    return;
  }

  // Users
  const { data: userRows, error: userErr } = await getSupabaseServer()
    .from('users')
    .select('id, auth_id, email, account_mode, name, data');
  if (userErr) throw new Error(`Failed to load users: ${userErr.message}`);
  db.users.splice(0, db.users.length, ...
    (userRows || [])
      .filter((row: any) => row.email)
      .map((row: any) => ({
        ...row.data,
        id: row.id,
        email: row.email,
        name: row.name,
        accountMode: row.account_mode,
        authId: row.auth_id || row.data?.authId,
      }))
  );

  // Organizations
  const { data: orgRows, error: orgErr } = await getSupabaseServer()
    .from('organizations')
    .select('id, domain, data');
  if (orgErr) throw new Error(`Failed to load organizations: ${orgErr.message}`);
  db.organizations.splice(0, db.organizations.length, ...
    (orgRows || []).map((row: any) => ({
      ...row.data,
      id: row.id,
      domain: row.domain,
    }))
  );

  // Mode-split tables
  for (const { table, personal, organization } of MODE_SPLIT_TABLES) {
    const { data: rows, error } = await getSupabaseServer().from(table).select('id, mode, data');
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`);

    db[personal].splice(0, db[personal].length);
    db[organization].splice(0, db[organization].length);

    for (const row of rows || []) {
      const item = { ...row.data, id: row.id, mode: row.mode };
      if (row.mode === 'organization') {
        db[organization].push(item);
      } else {
        db[personal].push(item);
      }
    }
  }

  // Single tables
  for (const table of SINGLE_TABLES) {
    const prop = snakeToCamel(table);
    const { data: rows, error } = await getSupabaseServer().from(table).select('id, data');
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`);

    if (prop === 'subscriptions') {
      if (rows && rows[0]) {
        Object.assign(db.subscription, rows[0].data);
      }
      continue;
    }

    db[prop].splice(0, db[prop].length, ...(rows || []).map((row: any) => ({ ...row.data, id: row.id })));
  }
}

async function persistDbInternal(db: any) {
  if (isBuildPhase()) {
    return;
  }

  // Users
  const userRows = db.users
    .filter((u: any) => u.email)
    .map((u: any) => ({
      id: u.id,
      auth_id: u.authId || u.auth_id || null,
      email: u.email,
      name: u.name,
      account_mode: u.accountMode || 'personal',
      data: { ...u },
    }));
  if (userRows.length > 0) {
    const { error } = await getSupabaseServer().from('users').upsert(userRows, { onConflict: 'id' });
    if (error) throw new Error(`Failed to save users: ${error.message}`);
  }

  // Organizations
  const orgRows = db.organizations.map((o: any) => ({
    id: o.id,
    domain: o.domain,
    data: { ...o },
  }));
  if (orgRows.length > 0) {
    const { error } = await getSupabaseServer().from('organizations').upsert(orgRows, { onConflict: 'id' });
    if (error) throw new Error(`Failed to save organizations: ${error.message}`);
  }

  // Mode-split tables
  for (const { table, personal, organization } of MODE_SPLIT_TABLES) {
    const rows = [
      ...db[personal].map((item: any) => ({ id: item.id, mode: 'personal', data: { ...item } })),
      ...db[organization].map((item: any) => ({ id: item.id, mode: 'organization', data: { ...item } })),
    ];
    if (rows.length > 0) {
      const { error } = await getSupabaseServer().from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Failed to save ${table}: ${error.message}`);
    }
  }

  // Single tables
  for (const table of SINGLE_TABLES) {
    if (table === 'subscriptions') {
      const { error } = await getSupabaseServer().from('subscriptions').upsert(
        { id: 'sub-main', data: { ...db.subscription } },
        { onConflict: 'id' }
      );
      if (error) throw new Error(`Failed to save subscription: ${error.message}`);
      continue;
    }

    const prop = snakeToCamel(table);
    const rows = db[prop].map((item: any) => ({ id: item.id, data: { ...item } }));
    if (rows.length > 0) {
      const { error } = await getSupabaseServer().from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Failed to save ${table}: ${error.message}`);
    }
  }
}

// Serialize all persistDb calls through a single queue. Without this, an
// explicit `await persistDb(db)` (called from most API routes right after
// mutating data) can overlap with a debounced schedulePersist() call
// triggered by the same mutation (see below), firing two full sets of
// concurrent upserts against Supabase from the same process. That overlap
// has been observed to trigger spurious "row-level security policy"
// errors from Supabase's connection pooler under load, on top of being
// wasteful. Running persists one-at-a-time eliminates the overlap entirely.
let persistQueue: Promise<void> = Promise.resolve();

export function persistDb(db: any): Promise<void> {
  const run = persistQueue.then(() => persistDbInternal(db));
  // Swallow so a failed persist doesn't permanently poison the queue for
  // subsequent, unrelated persist calls.
  persistQueue = run.catch(() => {});
  return run;
}

let persistTimer: NodeJS.Timeout | null = null;

export function schedulePersist(db: any) {
  if (isBuildPhase()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistDb(db).catch((err) => {
      console.error('Scheduled persist failed:', err);
    });
  }, 300);
}
