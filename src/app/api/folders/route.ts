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

    folders.sort((a, b) => {
      const soA = a.sortOrder ?? 0;
      const soB = b.sortOrder ?? 0;
      if (soA !== soB) return soA - soB;
      return a.id.localeCompare(b.id);
    });

    const currentUserId = authUser.id;
    const currentUserEmail = authUser.email.toLowerCase();
    const resourcesStore = db.resourcesFor(userMode);

    const canManage = authUser.role === 'Owner';
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

    const isResourceVisibleToMe = (r: any) => {
      if (r.isPrivateOnly) return false;
      if (r.ownerId === currentUserId) return true;
      if (isExplicitlySharedWithMe(r)) return true;
      if (r.folderId && groupFolderIds.has(r.folderId)) return true;
      return false;
    };

    const userNameMap = new Map(db.users.map((u) => [u.id, u.name]));
    folders = folders.map((f) => ({
      ...f,
      creatorName: userNameMap.get(f.creatorId || '') || 'Unknown',
    }));

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

    // Organization management view: show all workplace folders with visible item counts.
    if (isManagerView) {
      const foldersWithCounts = folders.map((f) => ({
        ...f,
        itemCount: resourcesStore.filter((r) => r.folderId === f.id && isResourceVisibleToMe(r)).length,
      }));
      return NextResponse.json(foldersWithCounts);
    }

    // Organization member view: show only folders the user owns, is explicitly shared, or is assigned through a group.
    const foldersWithCounts = folders.map((f) => ({
      ...f,
      itemCount: resourcesStore.filter((r) => r.folderId === f.id && isResourceVisibleToMe(r)).length,
    }));

    const visibleFolders = foldersWithCounts.filter((f) => {
      if (f.creatorId === currentUserId) return true;
      if (groupFolderIds.has(f.id)) return true;
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

    const existing = db.foldersFor(userMode);
    const maxSort = existing.reduce((m, it) => Math.max(m, it.sortOrder ?? 0), 0);

    const newFolder = {
      id: `f-${Date.now()}`,
      name,
      description: description || '',
      itemCount: 0,
      lastModified: new Date().toISOString(),
      isPrivateOnly: !!isPrivateOnly,
      mode: userMode,
      creatorId: authUser.id,
      sortOrder: maxSort + 1,
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
