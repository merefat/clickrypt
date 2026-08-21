import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
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

  return NextResponse.json(folder);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
  const { id } = await params;
  const store = db.foldersFor(userMode);
  const index = store.findIndex((f) => f.id === id);

  if (index === -1) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const deletedFolder = store.splice(index, 1)[0];

  db.auditLogsFor(userMode).unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'DELETE_FOLDER',
    userId: authUser.id,
    resourceId: id,
    details: `Deleted vault folder "${deletedFolder.name}"`,
  });

  return NextResponse.json({ success: true, message: `Folder ${deletedFolder.name} deleted successfully` });
}
