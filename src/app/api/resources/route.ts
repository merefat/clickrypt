import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';
import { ENABLE_PAY_BILL } from '@/lib/config';
import { encryptSecret } from '@/lib/crypto';
import {
  getUserGroupFolderIds,
  canUserAccessResource,
  isResourceSharedOut,
  sanitizeResourceForUser,
} from '@/lib/resourceAuth';

export async function GET(request: Request) {
  // Subscription check
  if (ENABLE_PAY_BILL && (db.subscription.status === 'Expired' || db.subscription.daysRemaining <= 0)) {
    return NextResponse.json(
      { error: 'Organization subscription expired. Payment required to unlock vault.' },
      { status: 402 }
    );
  }

  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase() || '';
  const folderId = searchParams.get('folderId');
  const secretVaultStr = searchParams.get('secretVault');
  const sharedWithUserId = searchParams.get('sharedWithUserId');
  const requestedMode = request.headers.get('x-app-mode') || searchParams.get('mode');
  const userMode = (requestedMode === 'organization' || requestedMode === 'personal')
    ? requestedMode
    : ((authUser.accountMode || 'personal') as 'personal' | 'organization');

  const currentUserId = authUser.id;

  const store = db.resourcesFor(userMode);
  const userGroupFolderIds = getUserGroupFolderIds(currentUserId, db.groups);

  let result: any[] = [];

  if (sharedWithUserId || authUser.role === 'External') {
    // /shared page & External User Access:
    // Outbound: items owned by current user that are explicitly shared
    const outbound = store.filter((r) => r.ownerId === currentUserId && isResourceSharedOut(r));

    // Inbound: items NOT owned by current user where current user is an authorized recipient across ALL stores
    const allInboundCandidates = [
      ...db.resources.filter((r) => r.ownerId !== currentUserId),
      ...db.organizationResources.filter((r) => r.ownerId !== currentUserId),
    ];
    const seenIds = new Set<string>();
    const inbound: any[] = [];
    for (const r of allInboundCandidates) {
      if (!seenIds.has(r.id) && canUserAccessResource(r, authUser, userGroupFolderIds)) {
        seenIds.add(r.id);
        inbound.push(r);
      }
    }
    result = [...outbound, ...inbound];
  } else if (secretVaultStr === 'true') {
    // Secret Vault (/secret-vault page): Only show private items owned by the current user
    if (userMode !== 'organization') {
      return NextResponse.json({ error: 'Secret Vault is only available in organization mode' }, { status: 403 });
    }
    result = store.filter((r) => r.ownerId === currentUserId && r.isPrivateOnly === true);
  } else {
    // Standard Main Vault (/vault page): Show items accessible by the user that are NOT secret vault private items
    result = store.filter((r) => {
      if (r.isPrivateOnly) return false;
      return canUserAccessResource(r, authUser, userGroupFolderIds);
    });
  }

  if (folderId) {
    result = result.filter((r) => r.folderId === folderId);
  }

  if (search) {
    result = result.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.username.toLowerCase().includes(search) ||
        r.url.toLowerCase().includes(search)
    );
  }

  result.sort((a, b) => {
    const soA = a.sortOrder ?? 0;
    const soB = b.sortOrder ?? 0;
    if (soA !== soB) return soA - soB;
    return a.id.localeCompare(b.id);
  });

  const usersById = new Map<string, string>(db.users.map((u) => [u.id, u.name]));
  const usersByEmail = new Map<string, string>(db.users.map((u) => [u.email.toLowerCase(), u.name]));

  const enriched = result.map((r) => {
    const ownerName = usersById.get(r.ownerId) || 'Vault Owner';
    let lastModified = r.lastModified;
    if (!lastModified || Number.isNaN(new Date(lastModified).getTime())) {
      const idTs = typeof r.id === 'string' && r.id.startsWith('r-') ? Number(r.id.slice(2)) : NaN;
      lastModified = Number.isNaN(idTs) ? new Date().toISOString() : new Date(idTs).toISOString();
    }

    const seen = new Set<string>();
    const recipients: { id: string; name: string; email?: string; external?: boolean }[] = [];

    (r.sharedWith || []).forEach((value: string) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const name = usersById.get(value) || usersByEmail.get(key) || value;
      recipients.push({ id: value, name });
    });

    if (r.isExternalShared && r.externalShareEmail) {
      const key = r.externalShareEmail.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        recipients.push({ id: r.externalShareEmail, name: r.externalShareEmail, email: r.externalShareEmail, external: true });
      }
    }

    // Sanitize secrets so only the requesting user's ciphertext is returned
    const sanitized = sanitizeResourceForUser(r, authUser);

    return { ...sanitized, ownerName, lastModified, recipients };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  if (ENABLE_PAY_BILL && (db.subscription.status === 'Expired' || db.subscription.daysRemaining <= 0)) {
    return NextResponse.json(
      { error: 'Organization subscription expired. Payment required to unlock vault.' },
      { status: 402 }
    );
  }

  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!body.encryptedData && !body.password) {
      return NextResponse.json({ error: 'Password or encrypted data is required' }, { status: 400 });
    }

    const existing = db.resourcesFor(userMode);
    const maxSort = existing.reduce((m, it) => Math.max(m, it.sortOrder ?? 0), 0);

    let creatorEncryptedData = body.encryptedData;
    if (body.password && authUser.publicKey) {
      creatorEncryptedData = await encryptSecret(body.password, authUser.publicKey);
    }
    if (!creatorEncryptedData) {
      return NextResponse.json({ error: 'No usable encrypted data for the creator' }, { status: 400 });
    }

    // Creator's secret ONLY. No auto-encryption for Owner or others.
    const secrets = [
      {
        userId: authUser.id,
        encryptedData: creatorEncryptedData,
      },
    ];

    const newResource = {
      id: `r-${Date.now()}`,
      name: body.name,
      username: body.username || '',
      url: body.url || '',
      ownerId: authUser.id,
      folderId: body.folderId || null,
      isPrivateOnly: !!body.isPrivateOnly,
      mode: userMode,
      strength: body.strength || 'Strong',
      lastModified: new Date().toISOString(),
      sortOrder: maxSort + 1,
      secrets,
    };

    db.resourcesFor(userMode).unshift(newResource);

    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CREATE_RESOURCE',
      userId: authUser.id,
      resourceId: newResource.id,
      details: `Created new password item: ${newResource.name}`,
    });

    await persistDb(db);

    return NextResponse.json(newResource);
  } catch (error) {
    console.error('Resource POST error details:', error);
    return NextResponse.json({ error: 'Failed to create resource', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
