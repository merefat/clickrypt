import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
  const { id } = await params;
  const resource = db.resourcesFor(userMode).find((r) => r.id === id);
  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }
  return NextResponse.json(resource);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
  const { id } = await params;
  const body = await request.json();

  const store = db.resourcesFor(userMode);
  const index = store.findIndex((r) => r.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  const res = store[index];
  res.name = body.name || res.name;
  res.username = body.username || res.username;
  res.url = body.url || res.url;
  res.folderId = body.folderId !== undefined ? body.folderId : res.folderId;
  res.isPrivateOnly = body.isPrivateOnly !== undefined ? body.isPrivateOnly : res.isPrivateOnly;
  res.strength = body.strength || res.strength;
  res.lastModified = new Date().toISOString();

  if (body.addGroupId) {
    const group = db.groups.find((g) => g.id === body.addGroupId);
    if (group) {
      if (!group.assignedResourceIds) group.assignedResourceIds = [];
      if (!group.assignedResourceIds.includes(id)) {
        group.assignedResourceIds.push(id);
      }
    }
  }

  if (body.removeGroupId) {
    const group = db.groups.find((g) => g.id === body.removeGroupId);
    if (group && group.assignedResourceIds) {
      group.assignedResourceIds = group.assignedResourceIds.filter((rid) => rid !== id);
    }
  }

  if (body.encryptedSecret) {
    const ownerSecret = res.secrets.find((s) => s.userId === authUser.id);
    if (ownerSecret) {
      ownerSecret.encryptedData = body.encryptedSecret;
    } else {
      res.secrets.push({ userId: authUser.id, encryptedData: body.encryptedSecret });
    }
  }

  db.auditLogsFor(userMode).unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'UPDATE_RESOURCE',
    userId: authUser.id,
    resourceId: id,
    details: `Updated resource ${res.name}`,
  });

  persistDb(db);
  return NextResponse.json(res);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
  const { id } = await params;
  const store = db.resourcesFor(userMode);
  const index = store.findIndex((r) => r.id === id);

  if (index === -1) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  const deleted = store.splice(index, 1)[0];

  db.auditLogsFor(userMode).unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'DELETE_RESOURCE',
    userId: authUser.id,
    resourceId: id,
    details: `Deleted password item "${deleted.name}"`,
  });

  persistDb(db);
  return NextResponse.json({ success: true, message: `Password item ${deleted.name} deleted successfully` });
}
