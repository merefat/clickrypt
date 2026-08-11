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

  db.folders.splice(index, 1);
  return NextResponse.json({ success: true });
}
