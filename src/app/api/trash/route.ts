import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';
import { getSupabaseServer } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase() || '';
  const typeFilter = searchParams.get('type') || 'all'; // all | resources | folders
  const categoryFilter = searchParams.get('category') || 'All';
  const requestedMode = request.headers.get('x-app-mode') || searchParams.get('mode');
  const userMode = (requestedMode === 'organization' || requestedMode === 'personal')
    ? requestedMode
    : ((authUser.accountMode || 'personal') as 'personal' | 'organization');

  const currentUserId = authUser.id;
  const isOrgAdmin = authUser.role === 'Owner' || authUser.role === 'Admin';

  // 1. Fetch Trashed Resources
  const allResources = db.resourcesFor(userMode);
  let trashedResources = allResources.filter((r) => {
    if (!r.deletedAt) return false;
    if (userMode === 'personal') {
      return r.ownerId === currentUserId;
    }
    // Organization mode: owners see their own items, Admins/Owners see all org trashed items
    return isOrgAdmin || r.ownerId === currentUserId || r.deletedBy === currentUserId;
  });

  if (categoryFilter && categoryFilter !== 'All') {
    trashedResources = trashedResources.filter((r) => (r as any).category === categoryFilter);
  }

  if (search) {
    trashedResources = trashedResources.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.username.toLowerCase().includes(search) ||
        r.url.toLowerCase().includes(search)
    );
  }

  // 2. Fetch Trashed Folders
  const allFolders = db.foldersFor(userMode);
  let trashedFolders = allFolders.filter((f) => {
    if (!f.deletedAt) return false;
    if (userMode === 'personal') {
      const creator = f.creatorId || (f as any).ownerId;
      return creator === currentUserId || f.deletedBy === currentUserId;
    }
    return isOrgAdmin || f.creatorId === currentUserId || (f as any).ownerId === currentUserId || f.deletedBy === currentUserId;
  });

  if (search) {
    trashedFolders = trashedFolders.filter((f) =>
      f.name.toLowerCase().includes(search) || (f.description && f.description.toLowerCase().includes(search))
    );
  }

  // Lookups
  const usersById = new Map<string, string>(db.users.map((u) => [u.id, u.name]));
  const allFoldersCombined = [...db.folders, ...db.organizationFolders];
  const foldersById = new Map<string, string>(allFoldersCombined.map((f) => [f.id, f.name]));

  const enrichedResources = trashedResources.map((r) => {
    const ownerName = usersById.get(r.ownerId) || 'Vault Owner';
    const deletedByName = r.deletedBy ? usersById.get(r.deletedBy) || r.deletedBy : ownerName;
    const targetFolderId = r.originalFolderId || r.folderId;
    const originalFolderName = targetFolderId ? foldersById.get(targetFolderId) || 'Deleted Folder' : 'Root Vault';

    return {
      id: r.id,
      name: r.name,
      username: r.username,
      url: r.url,
      category: (r as any).category || 'General',
      ownerId: r.ownerId,
      ownerName,
      folderId: r.folderId,
      originalFolderId: r.originalFolderId,
      originalFolderName,
      deletedAt: r.deletedAt,
      deletedBy: r.deletedBy,
      deletedByName,
      strength: r.strength || 'Strong',
      mode: r.mode || userMode,
      isPrivateOnly: r.isPrivateOnly || false,
    };
  });

  const enrichedFolders = trashedFolders.map((f) => {
    const creatorId = f.creatorId || (f as any).ownerId;
    const creatorName = creatorId ? usersById.get(creatorId) || 'User' : 'User';
    const deletedByName = f.deletedBy ? usersById.get(f.deletedBy) || f.deletedBy : creatorName;

    return {
      id: f.id,
      name: f.name,
      description: f.description,
      itemCount: f.itemCount || 0,
      creatorId,
      creatorName,
      deletedAt: f.deletedAt,
      deletedBy: f.deletedBy,
      deletedByName,
      mode: f.mode || userMode,
    };
  });

  return NextResponse.json({
    resources: typeFilter === 'folders' ? [] : enrichedResources,
    folders: typeFilter === 'resources' ? [] : enrichedFolders,
    totalCount: enrichedResources.length + enrichedFolders.length,
  });
}

export async function DELETE(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestedMode = request.headers.get('x-app-mode');
    const userMode = (requestedMode === 'organization' || requestedMode === 'personal')
      ? requestedMode
      : ((authUser.accountMode || 'personal') as 'personal' | 'organization');

    const body = await request.json().catch(() => ({}));
    const { resourceIds = [], folderIds = [], emptyAll } = body;
    const isOrgAdmin = authUser.role === 'Owner' || authUser.role === 'Admin';
    const currentUserId = authUser.id;

    let purgedResIds: string[] = [];
    let purgedFolderIds: string[] = [];

    const resStoreName = userMode === 'organization' ? 'organizationResources' : 'resources';
    const foldStoreName = userMode === 'organization' ? 'organizationFolders' : 'folders';

    if (emptyAll) {
      // Empty all trashed items
      const candidateResources = db[resStoreName].filter((r) => {
        if (!r.deletedAt) return false;
        return isOrgAdmin || r.ownerId === currentUserId || r.deletedBy === currentUserId;
      });
      purgedResIds = candidateResources.map((r) => r.id);
      const resIdSet = new Set(purgedResIds);
      db[resStoreName] = db[resStoreName].filter((r) => !resIdSet.has(r.id));

      const candidateFolders = db[foldStoreName].filter((f) => {
        if (!f.deletedAt) return false;
        const creator = f.creatorId || (f as any).ownerId;
        return isOrgAdmin || creator === currentUserId || f.deletedBy === currentUserId;
      });
      purgedFolderIds = candidateFolders.map((f) => f.id);
      const foldIdSet = new Set(purgedFolderIds);
      db[foldStoreName] = db[foldStoreName].filter((f) => !foldIdSet.has(f.id));
    } else {
      // Specific IDs
      if (Array.isArray(resourceIds) && resourceIds.length > 0) {
        for (const rid of resourceIds) {
          const index = db[resStoreName].findIndex((r) => r.id === rid);
          if (index !== -1) {
            const r = db[resStoreName][index];
            if (isOrgAdmin || r.ownerId === currentUserId || r.deletedBy === currentUserId) {
              db[resStoreName].splice(index, 1);
              purgedResIds.push(rid);
            }
          }
        }
      }

      if (Array.isArray(folderIds) && folderIds.length > 0) {
        for (const fid of folderIds) {
          const index = db[foldStoreName].findIndex((f) => f.id === fid);
          if (index !== -1) {
            const f = db[foldStoreName][index];
            const creator = f.creatorId || (f as any).ownerId;
            if (isOrgAdmin || creator === currentUserId || f.deletedBy === currentUserId) {
              db[foldStoreName].splice(index, 1);
              purgedFolderIds.push(fid);
            }
          }
        }
      }
    }

    // Hard delete from Supabase PostgreSQL
    if (purgedResIds.length > 0) {
      await getSupabaseServer().from('resources').delete().in('id', purgedResIds);
    }
    if (purgedFolderIds.length > 0) {
      await getSupabaseServer().from('folders').delete().in('id', purgedFolderIds);
    }

    // Record audit logs
    if (emptyAll) {
      db.auditLogsFor(userMode).unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'EMPTY_TRASH',
        userId: authUser.id,
        details: `Emptied trash: permanently purged ${purgedResIds.length} password item(s) and ${purgedFolderIds.length} folder(s)`,
      });
    } else {
      if (purgedResIds.length > 0) {
        db.auditLogsFor(userMode).unshift({
          id: `al-${Date.now()}`,
          timestamp: new Date().toISOString(),
          action: 'PERMANENT_DELETE_RESOURCE',
          userId: authUser.id,
          details: `Permanently deleted ${purgedResIds.length} password item(s) from trash`,
        });
      }
      if (purgedFolderIds.length > 0) {
        db.auditLogsFor(userMode).unshift({
          id: `al-${Date.now() + 1}`,
          timestamp: new Date().toISOString(),
          action: 'PERMANENT_DELETE_FOLDER',
          userId: authUser.id,
          details: `Permanently deleted ${purgedFolderIds.length} folder(s) from trash`,
        });
      }
    }

    await persistDb(db);

    return NextResponse.json({
      success: true,
      purgedResourcesCount: purgedResIds.length,
      purgedFoldersCount: purgedFolderIds.length,
      message: `Permanently deleted ${purgedResIds.length} item(s) and ${purgedFolderIds.length} folder(s)`,
    });
  } catch (error: any) {
    console.error('Failed to purge trash items:', error);
    return NextResponse.json({ error: error.message || 'Failed to purge trash' }, { status: 500 });
  }
}
