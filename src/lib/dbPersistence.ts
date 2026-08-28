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
        status: row.data?.status || 'Active',
        role: row.data?.role || 'User',
        publicKey: '',
        encryptedPrivateKey: '',
        lastActive: row.data?.lastActive || (row.data?.status === 'Invited' ? 'Pending Onboarding' : 'Just now'),
        ...row.data,
        id: row.id,
        email: row.email || row.data?.email,
        name: row.name || row.data?.name || (row.email ? row.email.split('@')[0] : 'User'),
        accountMode: (row.account_mode || row.data?.accountMode || 'personal') as 'personal' | 'organization',
        authId: row.auth_id || row.data?.authId,
        organizationId: row.data?.organizationId,
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

  // Enforce single-owner rule: only the user matching org.ownerId can be Owner
  for (const org of db.organizations) {
    if (org.ownerId) {
      for (const u of db.users) {
        if (u.organizationId === org.id || (org.domain && u.email?.toLowerCase().endsWith('@' + org.domain.toLowerCase()))) {
          if (u.id === org.ownerId) {
            u.role = 'Owner';
          } else if (u.role === 'Owner') {
            u.role = 'User';
          }
        }
      }
    }
  }

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

    if (table === 'groups') {
      const { data: groupRows, error: gErr } = await getSupabaseServer().from('groups').select('id, name, description, organization_id, data');
      if (!gErr && groupRows) {
        db.groups.splice(
          0,
          db.groups.length,
          ...groupRows.map((row: any) => ({
            ...row.data,
            id: row.id,
            name: row.name || row.data?.name,
            description: row.description || row.data?.description,
            organizationId: row.organization_id || row.data?.organizationId || null,
          }))
        );
        continue;
      }
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
      data: {
        status: 'Active',
        role: 'User',
        ...u,
        organizationId: u.organizationId || null,
      },
    }));
  if (userRows.length > 0) {
    const { error } = await getSupabaseServer().from('users').upsert(userRows, { onConflict: 'id' });
    if (error) console.error(`Failed to save users: ${error.message}`);
  }

  // Organizations
  const orgRows = db.organizations.map((o: any) => ({
    id: o.id,
    domain: o.domain,
    data: { ...o },
  }));
  if (orgRows.length > 0) {
    const { error } = await getSupabaseServer().from('organizations').upsert(orgRows, { onConflict: 'id' });
    if (error) console.error(`Failed to save organizations: ${error.message}`);
  }

  // Mode-split tables (resources, folders, audit_logs)
  const validUserIds = new Set(db.users.map((u: any) => u.id));
  const validFolderIds = new Set([
    ...db.folders.map((f: any) => f.id),
    ...db.organizationFolders.map((f: any) => f.id),
  ]);

  for (const { table, personal, organization } of MODE_SPLIT_TABLES) {
    const allItems = [
      ...db[personal].map((item: any) => ({ item, mode: 'personal' })),
      ...db[organization].map((item: any) => ({ item, mode: 'organization' })),
    ];

    let rows: any[] = [];
    if (table === 'resources') {
      rows = allItems.map(({ item, mode }) => ({
        id: item.id,
        name: item.name,
        username: item.username || '',
        url: item.url || '',
        owner_id: validUserIds.has(item.ownerId) ? item.ownerId : null,
        folder_id: validFolderIds.has(item.folderId) ? item.folderId : null,
        is_private_only: !!item.isPrivateOnly,
        strength: item.strength || 'Strong',
        secrets_data: item.secrets || [],
        tags: item.tags || [],
        last_modified: item.lastModified || new Date().toISOString(),
        mode,
        data: { ...item },
      }));
    } else if (table === 'folders') {
      rows = allItems.map(({ item, mode }) => {
        const rawOwner = item.creatorId || item.ownerId;
        return {
          id: item.id,
          name: item.name,
          description: item.description || '',
          item_count: item.itemCount || 0,
          last_modified: item.lastModified || new Date().toISOString(),
          owner_id: validUserIds.has(rawOwner) ? rawOwner : null,
          mode,
          data: { ...item },
        };
      });
    } else if (table === 'audit_logs') {
      rows = allItems.map(({ item, mode }) => ({
        id: item.id,
        timestamp: item.timestamp || new Date().toISOString(),
        action: item.action,
        user_id: validUserIds.has(item.userId) ? item.userId : null,
        resource_id: item.resourceId || null,
        details: item.details || '',
        mode,
        data: { ...item },
      }));
    } else {
      rows = allItems.map(({ item, mode }) => ({ id: item.id, mode, data: { ...item } }));
    }

    if (rows.length > 0) {
      const { error } = await getSupabaseServer().from(table).upsert(rows, { onConflict: 'id' });
      if (error) console.error(`Failed to save ${table}: ${error.message}`);
    }
  }

  // Synchronize resource_shares table from secrets array
  try {
    const allResources = [...db.resources, ...db.organizationResources];
    const shareRows = allResources.flatMap((r: any) => {
      if (!r.secrets || !Array.isArray(r.secrets)) return [];
      return r.secrets
        .filter((s: any) => s.userId && s.userId !== r.ownerId)
        .map((s: any) => ({
          id: `share-${r.id}-${s.userId}`,
          resource_id: r.id,
          recipient_id: s.userId,
          encrypted_symmetric_key: s.encryptedData || '',
          shared_by: r.ownerId,
          permission: 'read',
          shared_at: r.lastModified || new Date().toISOString(),
        }));
    });
    if (shareRows.length > 0) {
      await getSupabaseServer().from('resource_shares').upsert(shareRows, { onConflict: 'resource_id,recipient_id' });
    }
  } catch (err: any) {
    console.error('Failed to sync resource_shares:', err.message);
  }

  // Single tables (groups, invitations, etc.)
  for (const table of SINGLE_TABLES) {
    if (table === 'subscriptions') {
      const { error } = await getSupabaseServer().from('subscriptions').upsert(
        { id: 'sub-main', data: { ...db.subscription } },
        { onConflict: 'id' }
      );
      if (error) console.error(`Failed to save subscription: ${error.message}`);
      continue;
    }

    if (table === 'groups') {
      const validOrgIds = new Set(db.organizations.map((o: any) => o.id));
      const rows = db.groups.map((g: any) => ({
        id: g.id,
        name: g.name,
        description: g.description || '',
        organization_id: (g.organizationId && validOrgIds.has(g.organizationId)) ? g.organizationId : null,
        last_active: g.lastActive || 'Just now',
        data: { ...g },
      }));
      if (rows.length > 0) {
        const { error } = await getSupabaseServer().from('groups').upsert(rows, { onConflict: 'id' });
        if (error) console.error(`Failed to save groups: ${error.message}`);
      }
      continue;
    }

    const prop = snakeToCamel(table);
    const rows = db[prop].map((item: any) => ({ id: item.id, data: { ...item } }));
    if (rows.length > 0) {
      const { error } = await getSupabaseServer().from(table).upsert(rows, { onConflict: 'id' });
      if (error) console.error(`Failed to save ${table}: ${error.message}`);
    }
  }

  // Synchronize group join tables (group_members, group_folders)
  try {
    const groupMemberRows = db.groups.flatMap((g: any) =>
      (g.members || []).map((m: any) => ({
        group_id: g.id,
        user_id: m.userId,
        created_at: g.createdAt || new Date().toISOString(),
      }))
    );
    if (groupMemberRows.length > 0) {
      await getSupabaseServer().from('group_members').upsert(groupMemberRows, { onConflict: 'group_id,user_id' });
    }

    const groupFolderRows = db.groups.flatMap((g: any) =>
      (g.assignedFolderIds || []).map((folderId: string) => ({
        group_id: g.id,
        folder_id: folderId,
        created_at: g.createdAt || new Date().toISOString(),
      }))
    );
    if (groupFolderRows.length > 0) {
      await getSupabaseServer().from('group_folders').upsert(groupFolderRows, { onConflict: 'group_id,folder_id' });
    }
  } catch (err: any) {
    console.error('Failed to sync group relational tables:', err.message);
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
