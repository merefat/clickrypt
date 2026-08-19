import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { ENABLE_PAY_BILL } from '@/lib/config';

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
  const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';

  const currentUserId = authUser.id;
  const currentUserEmail = authUser.email.toLowerCase();

  const store = db.resourcesFor(userMode);

  // Find all groups the current user is a member of
  const userGroups = db.groups.filter((g) => g.members.some((m) => m.userId === currentUserId));
  const userGroupFolderIds = new Set<string>();
  userGroups.forEach((g) => {
    if (g.assignedFolderIds) {
      g.assignedFolderIds.forEach((fid) => userGroupFolderIds.add(fid));
    }
  });

  let result: any[] = [];

  if (sharedWithUserId) {
    // Shared With Me / Shared Out Panel (/shared page)
    result = store.filter((r) => {
      const isOwner = r.ownerId === currentUserId;
      const isSharedOut = isOwner && ((r.secrets && r.secrets.length > 1) || r.isExternalShared);
      const isRecipient = r.secrets && r.secrets.some((s) => s.userId === currentUserId && s.userId !== r.ownerId);
      const isExplicitlyShared = r.sharedWith && (r.sharedWith.includes(currentUserId) || r.sharedWith.includes(currentUserEmail));
      const isExternalRecipient = r.isExternalShared && r.externalShareEmail?.toLowerCase() === currentUserEmail;
      const isViaGroupFolder = !isOwner && !!(r.folderId && userGroupFolderIds.has(r.folderId));

      return isSharedOut || (!isOwner && (isRecipient || isExplicitlyShared || isExternalRecipient || isViaGroupFolder));
    });
  } else if (secretVaultStr === 'true') {
    // Secret Vault is only available for organization-mode accounts
    if (userMode !== 'organization') {
      return NextResponse.json({ error: 'Secret Vault is only available in organization mode' }, { status: 403 });
    }
    // Secret Vault (/secret-vault page): Only show private items owned by the current user
    result = store.filter((r) => r.ownerId === currentUserId && r.isPrivateOnly === true);
  } else {
    // Standard Main Vault (/vault page): Show passwords OWNED by the current user + group folder assigned items
    result = store.filter((r) => {
      const isOwner = r.ownerId === currentUserId && !r.isPrivateOnly;
      const isViaGroupFolder = !!(r.folderId && userGroupFolderIds.has(r.folderId));
      return isOwner || isViaGroupFolder;
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
        r.url.toLowerCase().includes(search) ||
        r.category.toLowerCase().includes(search)
    );
  }

  return NextResponse.json(result);
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

    const newResource = {
      id: `r-${Date.now()}`,
      name: body.name,
      username: body.username || '',
      url: body.url || '',
      category: body.category || 'General',
      ownerId: authUser.id,
      folderId: body.folderId || null,
      isPrivateOnly: !!body.isPrivateOnly,
      mode: userMode,
      strength: body.strength || 'Strong',
      lastModified: 'Just now',
      secrets: [
        {
          userId: authUser.id,
          encryptedData: body.encryptedData || `[PGP-ENCRYPTED-BLOB::${Buffer.from(body.password).toString('base64')}]`,
        },
      ],
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

    return NextResponse.json(newResource);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 });
  }
}
