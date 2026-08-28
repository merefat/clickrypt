import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';
import { encryptSecret } from '@/lib/crypto';
import {
  getUserGroupFolderIds,
  canUserAccessResource,
  canUserModifyResource,
  sanitizeResourceForUser,
} from '@/lib/resourceAuth';

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

  const userGroupFolderIds = getUserGroupFolderIds(authUser.id, db.groups);
  if (!canUserAccessResource(resource, authUser, userGroupFolderIds)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sanitized = sanitizeResourceForUser(resource, authUser);
  return NextResponse.json(sanitized);
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

  // Only the resource owner can modify the resource
  if (!canUserModifyResource(res, authUser)) {
    return NextResponse.json({ error: 'Forbidden: Only the owner can modify this resource' }, { status: 403 });
  }

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

  // Keep the resource owner's secret in sync when a password changes
  if (body.password) {
    const resourceOwner = db.users.find((u) => u.id === res.ownerId);
    if (resourceOwner?.publicKey) {
      const resourceOwnerSecret = res.secrets.find((s) => s.userId === res.ownerId);
      const ownerEncryptedData = await encryptSecret(body.password, resourceOwner.publicKey);
      if (resourceOwnerSecret) {
        resourceOwnerSecret.encryptedData = ownerEncryptedData;
      } else {
        res.secrets.push({ userId: res.ownerId, encryptedData: ownerEncryptedData });
      }
    }

    // Also re-encrypt for explicit existing recipients in sharedWith if public keys are available
    if (res.sharedWith && Array.isArray(res.sharedWith)) {
      for (const recipientId of res.sharedWith) {
        const recipientUser = db.users.find((u) => u.id === recipientId || u.email?.toLowerCase() === recipientId.toLowerCase());
        if (recipientUser?.publicKey) {
          const recEncryptedData = await encryptSecret(body.password, recipientUser.publicKey);
          const existingSec = res.secrets.find((s) => s.userId === recipientUser.id);
          if (existingSec) {
            existingSec.encryptedData = recEncryptedData;
          } else {
            res.secrets.push({ userId: recipientUser.id, encryptedData: recEncryptedData });
          }
        }
      }
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
  const sanitized = sanitizeResourceForUser(res, authUser);
  return NextResponse.json(sanitized);
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

  const targetResource = store[index];

  // Only the resource owner can delete the resource
  if (!canUserModifyResource(targetResource, authUser)) {
    return NextResponse.json({ error: 'Forbidden: Only the owner can delete this resource' }, { status: 403 });
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
