import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const folder = db.folders.find((f) => f.id === id);

  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  if (body.name) folder.name = body.name;
  if (body.description) folder.description = body.description;
  folder.lastModified = 'Just now';

  return NextResponse.json(folder);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = db.folders.findIndex((f) => f.id === id);

  if (index === -1) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const deletedFolder = db.folders.splice(index, 1)[0];

  db.auditLogs.unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'DELETE_FOLDER',
    userId: 'u-1',
    resourceId: id,
    details: `Deleted vault folder "${deletedFolder.name}"`,
  });

  return NextResponse.json({ success: true, message: `Folder ${deletedFolder.name} deleted successfully` });
}
