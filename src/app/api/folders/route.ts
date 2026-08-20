import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    const { searchParams } = new URL(req.url);
    const secretVaultParam = searchParams.get('secretVault');
    const scope = searchParams.get('scope');

    const store = db.foldersFor(userMode);
    let folders = store;

    if (secretVaultParam === 'true') {
      folders = folders.filter((f) => f.isPrivateOnly === true);
    } else {
      folders = folders.filter((f) => !f.isPrivateOnly);
    }

    const currentUserId = authUser.id;
    const currentUserEmail = authUser.email.toLowerCase();

    const resourcesStore = db.resourcesFor(userMode);

    const userGroups = db.groups.filter((g) => g.members.some((m) => m.userId === currentUserId));
    const userGroupFolderIds = new Set<string>();
    userGroups.forEach((g) => {
      if (g.assignedFolderIds) {
        g.assignedFolderIds.forEach((fid) => userGroupFolderIds.add(fid));
      }
    });

    const isExplicitlySharedWithMe = (r: any) => {
      if (r.sharedWith && (r.sharedWith.includes(currentUserId) || r.sharedWith.includes(currentUserEmail))) return true;
      if (r.secrets && r.secrets.some((s: any) => s.userId === currentUserId && s.userId !== r.ownerId)) return true;
      return false;
    };

    const isResourceVisibleToMe = (r: any) => {
      const isOwner = r.ownerId === currentUserId && !r.isPrivateOnly;
      const isViaGroupFolder = !!(r.folderId && userGroupFolderIds.has(r.folderId));
      const isExplicitlyShared = isExplicitlySharedWithMe(r);
      const isSecretRecipient = r.secrets && r.secrets.some((s: any) => s.userId === currentUserId && s.userId !== r.ownerId);
      return isOwner || (!r.isPrivateOnly && (isViaGroupFolder || isExplicitlyShared || isSecretRecipient));
    };

    const isResourceExplicitlySharedWithMe = (r: any) => {
      return !r.isPrivateOnly && isExplicitlySharedWithMe(r);
    };

    const canManage = authUser.role === 'Owner' || authUser.role === 'Admin';
    const isManagerView = canManage && scope === 'manage';

    // Secret Vault: keep existing Owner-only private view.
    if (secretVaultParam === 'true') {
      const foldersWithCounts = folders.map((f) => ({
        ...f,
        itemCount: resourcesStore.filter((r) => r.folderId === f.id && r.isPrivateOnly === true).length,
      }));
      return NextResponse.json(foldersWithCounts);
    }

    // Personal mode: keep resource-level visibility behavior.
    if (userMode !== 'organization') {
      const foldersWithCounts = folders.map((f) => ({
        ...f,
        itemCount: resourcesStore.filter((r) => r.folderId === f.id && isResourceVisibleToMe(r)).length,
      }));
      return NextResponse.json(foldersWithCounts);
    }

    // Organization management view: show all workplace folders with total counts.
    if (isManagerView) {
      const foldersWithCounts = folders.map((f) => ({
        ...f,
        itemCount: resourcesStore.filter((r) => r.folderId === f.id && !r.isPrivateOnly).length,
      }));
      return NextResponse.json(foldersWithCounts);
    }

    // Organization user view: folder is visible only to its creator or when at
    // least one password is explicitly shared with the current user.
    const foldersWithCounts = folders.map((f) => {
      const isCreator = f.creatorId === currentUserId;
      const visibleResources = resourcesStore.filter((r) =>
        r.folderId === f.id && (isCreator ? isResourceVisibleToMe(r) : isResourceExplicitlySharedWithMe(r))
      );
      return { ...f, itemCount: visibleResources.length };
    });

    const visibleFolders = foldersWithCounts.filter((f) => f.creatorId === currentUserId || f.itemCount > 0);

    return NextResponse.json(visibleFolders);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    const body = await req.json();
    const { name, description, isPrivateOnly } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const newFolder = {
      id: `f-${Date.now()}`,
      name,
      description: description || '',
      itemCount: 0,
      lastModified: 'Just now',
      isPrivateOnly: !!isPrivateOnly,
      mode: userMode,
      creatorId: authUser.id,
    };

    db.foldersFor(userMode).unshift(newFolder);

    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CREATE_FOLDER',
      userId: authUser.id,
      details: `Created ${isPrivateOnly ? 'Private Secret' : 'Workplace'} folder ${name}`,
    });

    return NextResponse.json(newFolder, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
