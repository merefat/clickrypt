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
    const includeGroupFolders = searchParams.get('includeGroupFolders') === 'true';

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

    const canManage = authUser.role === 'Owner' || authUser.role === 'Admin';
    const isManagerView = canManage && scope === 'manage';

    const userGroups = db.groups.filter((g) => g.members.some((m) => m.userId === currentUserId));
    const groupFolderIds = new Set<string>();
    if (userMode === 'organization') {
      userGroups.forEach((g) => {
        (g.assignedFolderIds || []).forEach((fid: string) => groupFolderIds.add(fid));
      });
    }

    const isExplicitlySharedWithMe = (r: any) => {
      if (r.isPrivateOnly) return false;
      if (r.sharedWith && (r.sharedWith.includes(currentUserId) || r.sharedWith.includes(currentUserEmail))) return true;
      if (r.secrets && r.secrets.some((s: any) => s.userId === currentUserId && s.userId !== r.ownerId)) return true;
      return false;
    };

    const isResourceMineOrExplicitlyShared = (r: any) => {
      if (r.isPrivateOnly) return false;
      if (r.ownerId === currentUserId) return true;
      return isExplicitlySharedWithMe(r);
    };

    const isResourceVisibleToMe = (r: any) => {
      if (r.isPrivateOnly) return false;
      if (r.ownerId === currentUserId) return true;
      if (isExplicitlySharedWithMe(r)) return true;
      if (r.folderId && groupFolderIds.has(r.folderId)) return true;
      return false;
    };

    // Secret Vault: keep existing Owner-only private view.
    if (secretVaultParam === 'true') {
      const foldersWithCounts = folders.map((f) => ({
        ...f,
        itemCount: resourcesStore.filter((r) => r.folderId === f.id && r.isPrivateOnly === true).length,
      }));
      return NextResponse.json(foldersWithCounts);
    }

    // Personal mode: keep broad resource-level visibility.
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

    // Organization member view: default (Vault/Folders panels) OR include group folders for the Groups page.
    const foldersWithCounts = folders.map((f) => {
      const isCreator = f.creatorId === currentUserId;
      const isGroupFolder = groupFolderIds.has(f.id);

      if (includeGroupFolders && isGroupFolder) {
        // Full access through group assignment; show total count.
        return { ...f, itemCount: resourcesStore.filter((r) => r.folderId === f.id && !r.isPrivateOnly).length };
      }

      // Individual sharing: visible only if the user created it or has an explicitly shared password.
      const visibleResources = resourcesStore.filter(
        (r) => r.folderId === f.id && (isCreator ? isResourceMineOrExplicitlyShared(r) : isExplicitlySharedWithMe(r))
      );
      return { ...f, itemCount: visibleResources.length };
    });

    const visibleFolders = foldersWithCounts.filter((f) => {
      if (f.creatorId === currentUserId) return true;
      if (includeGroupFolders && groupFolderIds.has(f.id)) return true;
      return f.itemCount > 0;
    });

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
