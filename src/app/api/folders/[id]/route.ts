import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';
import { getSupabaseServer } from '@/lib/supabaseServer';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requestedMode = request.headers.get('x-app-mode');
  const userMode = (requestedMode === 'organization' || requestedMode === 'personal')
    ? requestedMode
    : ((authUser.accountMode || 'personal') as 'personal' | 'organization');
  const { id } = await params;
  const body = await request.json();
  const store = db.foldersFor(userMode);
  const folder = store.find((f) => f.id === id);

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  if (body.name) folder.name = body.name;
  if (body.description) folder.description = body.description;
  folder.lastModified = new Date().toISOString();

  await persistDb(db);
  return NextResponse.json(folder);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const requestedMode = request.headers.get('x-app-mode');
  const userMode = (requestedMode === 'organization' || requestedMode === 'personal')
    ? requestedMode
    : ((authUser.accountMode || 'personal') as 'personal' | 'organization');

  let storeName: 'folders' | 'organizationFolders' = userMode === 'organization' ? 'organizationFolders' : 'folders';
  let index = db[storeName].findIndex((f) => f.id === id);

  if (index === -1) {
    const otherStoreName = storeName === 'folders' ? 'organizationFolders' : 'folders';
    const otherIndex = db[otherStoreName].findIndex((f) => f.id === id);
    if (otherIndex !== -1) {
      storeName = otherStoreName;
      index = otherIndex;
    }
  }

  if (index === -1) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const targetFolder = db[storeName][index];

  const now = new Date().toISOString();
  targetFolder.deletedAt = now;
  targetFolder.deletedBy = authUser.id;
  targetFolder.lastModified = now;

  // Soft-delete child resources inside this folder
  const resStore = userMode === 'organization' ? db.organizationResources : db.resources;
  let childCount = 0;
  resStore.forEach((r) => {
    if (r.folderId === id && !r.deletedAt) {
      r.deletedAt = now;
      r.deletedBy = authUser.id;
      r.originalFolderId = id;
      r.lastModified = now;
      childCount++;
    }
  });

  db.auditLogsFor(userMode).unshift({
    id: `al-${Date.now()}`,
    timestamp: now,
    action: 'MOVE_TO_TRASH_FOLDER',
    userId: authUser.id,
    resourceId: id,
    details: `Moved vault folder "${targetFolder.name}" and ${childCount} item(s) to Trash`,
  });

  await persistDb(db);

  return NextResponse.json({ success: true, message: `Folder ${targetFolder.name} moved to Trash` });
}
