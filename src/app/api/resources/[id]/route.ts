import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = db.resources.find((r) => r.id === id);
  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }
  return NextResponse.json(resource);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const index = db.resources.findIndex((r) => r.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  const res = db.resources[index];
  res.name = body.name || res.name;
  res.username = body.username || res.username;
  res.url = body.url || res.url;
  res.category = body.category || res.category;
  res.lastModified = 'Just now';

  if (body.encryptedSecret) {
    const ownerSecret = res.secrets.find((s) => s.userId === 'u-1');
    if (ownerSecret) {
      ownerSecret.encryptedData = body.encryptedSecret;
    } else {
      res.secrets.push({ userId: 'u-1', encryptedData: body.encryptedSecret });
    }
  }

  db.auditLogs.unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'UPDATE_RESOURCE',
    userId: 'u-1',
    resourceId: id,
    details: `Updated resource ${res.name}`,
  });

  return NextResponse.json(res);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = db.resources.findIndex((r) => r.id === id);

  if (index === -1) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  const deleted = db.resources.splice(index, 1)[0];

  db.auditLogs.unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'DELETE_RESOURCE',
    userId: 'u-1',
    resourceId: id,
    details: `Deleted resource ${deleted.name}`,
  });

  return NextResponse.json({ success: true });
}
