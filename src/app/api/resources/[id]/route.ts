import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';
import { encryptSecret, safeBase64Decode } from '@/lib/crypto';

function decodeBase64Fallback(secrets: any[]): string | null {
  const fallback = secrets.find((s) => s?.encryptedData?.startsWith('[PGP-ENCRYPTED-BLOB::'));
  if (!fallback) return null;
  const decoded = safeBase64Decode(fallback.encryptedData);
  if (!decoded || decoded.startsWith('[PGP-ENCRYPTED-BLOB::') || decoded.includes('-----BEGIN PGP MESSAGE-----')) {
    return null;
  }
  return decoded;
}

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
  }

  // In organization mode, keep the organization owner's secret in sync when a password changes
  if (body.password && userMode === 'organization' && authUser.organizationId) {
    const owner = db.users.find(
      (u) => u.organizationId === authUser.organizationId && u.role === 'Owner'
    );
    if (owner && owner.id !== authUser.id) {
      const ownerSecret = res.secrets.find((s) => s.userId === owner.id);
      const ownerEncryptedData = await encryptSecret(body.password, owner.publicKey);
      if (ownerSecret) {
        ownerSecret.encryptedData = ownerEncryptedData;
      } else {
        res.secrets.push({ userId: owner.id, encryptedData: ownerEncryptedData });
      }
    }
  }

  // If a base64 fallback exists and owner/org-owner PGP copies are missing, backfill them
  const canBackfill = authUser.id === res.ownerId || authUser.role === 'Owner' || authUser.role === 'Admin';
  const fallbackPlain = !body.password && canBackfill ? decodeBase64Fallback(res.secrets || []) : null;
  if (fallbackPlain) {
    const resourceOwner = db.users.find((u) => u.id === res.ownerId);
    if (resourceOwner?.publicKey && !res.secrets.some((s: any) => s.userId === res.ownerId)) {
      res.secrets.push({
        userId: res.ownerId,
        encryptedData: await encryptSecret(fallbackPlain, resourceOwner.publicKey),
      });
    }

    if (userMode === 'organization' && authUser.organizationId) {
      const orgOwner = db.users.find(
        (u) => u.organizationId === authUser.organizationId && u.role === 'Owner'
      );
      if (orgOwner && orgOwner.id !== res.ownerId && !res.secrets.some((s: any) => s.userId === orgOwner.id)) {
        res.secrets.push({
          userId: orgOwner.id,
          encryptedData: await encryptSecret(fallbackPlain, orgOwner.publicKey),
        });
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
