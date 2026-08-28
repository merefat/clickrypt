import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';

export async function POST(request: Request) {
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
    const { resourceIds = [], folderIds = [] } = body;
    const isOrgAdmin = authUser.role === 'Owner' || authUser.role === 'Admin';
    const currentUserId = authUser.id;

    const resStoreName = userMode === 'organization' ? 'organizationResources' : 'resources';
    const foldStoreName = userMode === 'organization' ? 'organizationFolders' : 'folders';

    const allActiveFolders = db[foldStoreName].filter((f) => !f.deletedAt);
    const activeFolderIds = new Set(allActiveFolders.map((f) => f.id));

    let restoredResCount = 0;
    let restoredFolderCount = 0;

    // 1. Restore Folders First (so restored child resources can link back to them)
    if (Array.isArray(folderIds) && folderIds.length > 0) {
      for (const fid of folderIds) {
        const folder = db[foldStoreName].find((f) => f.id === fid);
        if (folder && folder.deletedAt) {
          const creator = folder.creatorId || (folder as any).ownerId;
          if (isOrgAdmin || creator === currentUserId || folder.deletedBy === currentUserId) {
            folder.deletedAt = null;
            folder.deletedBy = null;
            folder.lastModified = new Date().toISOString();
            activeFolderIds.add(folder.id);
            restoredFolderCount++;

            // Automatically restore child resources belonging to this folder that were trashed
            const childResources = db[resStoreName].filter(
              (r) => r.originalFolderId === folder.id && r.deletedAt != null
            );
            for (const child of childResources) {
              child.deletedAt = null;
              child.deletedBy = null;
              child.folderId = folder.id;
              child.lastModified = new Date().toISOString();
              restoredResCount++;
            }

            db.auditLogsFor(userMode).unshift({
              id: `al-${Date.now()}`,
              timestamp: new Date().toISOString(),
              action: 'RESTORE_FOLDER',
              userId: authUser.id,
              resourceId: folder.id,
              details: `Restored vault folder "${folder.name}" and ${childResources.length} child item(s)`,
            });
          }
        }
      }
    }

    // 2. Restore Individual Resources
    if (Array.isArray(resourceIds) && resourceIds.length > 0) {
      for (const rid of resourceIds) {
        const resource = db[resStoreName].find((r) => r.id === rid);
        if (resource && resource.deletedAt) {
          if (isOrgAdmin || resource.ownerId === currentUserId || resource.deletedBy === currentUserId) {
            resource.deletedAt = null;
            resource.deletedBy = null;
            resource.lastModified = new Date().toISOString();

            // Validate parent folder existence
            const targetFolderId = resource.originalFolderId || resource.folderId;
            if (targetFolderId && activeFolderIds.has(targetFolderId)) {
              resource.folderId = targetFolderId;
            } else {
              // Parent folder no longer exists or was permanently deleted -> restore to Root Vault
              resource.folderId = null;
            }

            restoredResCount++;

            db.auditLogsFor(userMode).unshift({
              id: `al-${Date.now()}`,
              timestamp: new Date().toISOString(),
              action: 'RESTORE_RESOURCE',
              userId: authUser.id,
              resourceId: resource.id,
              details: `Restored password item "${resource.name}" to ${resource.folderId ? 'original folder' : 'Root Vault'}`,
            });
          }
        }
      }
    }

    await persistDb(db);

    return NextResponse.json({
      success: true,
      restoredResourcesCount: restoredResCount,
      restoredFoldersCount: restoredFolderCount,
      message: `Restored ${restoredResCount} password item(s) and ${restoredFolderCount} folder(s) successfully`,
    });
  } catch (error: any) {
    console.error('Failed to restore items:', error);
    return NextResponse.json({ error: error.message || 'Failed to restore items' }, { status: 500 });
  }
}
