import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { action, revokeUserId, targetUserId, targetUserIds, encryptedData, secrets, isExternalShared, externalShareEmail } = body;

    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    const resource = db.resourcesFor(userMode).find((r) => r.id === id);
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Only the resource owner can share or revoke it
    if (resource.ownerId !== authUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // REVOCATION ACTION: Revoke sharing for a specific user ID or external share
    if (action === 'revoke' || revokeUserId) {
      const targetToRevoke = revokeUserId || targetUserId;
      if (targetToRevoke) {
        // Remove from secrets array (except owner)
        resource.secrets = resource.secrets.filter(
          (s) => s.userId !== targetToRevoke || s.userId === resource.ownerId
        );
        // Remove from sharedWith array
        if (resource.sharedWith) {
          resource.sharedWith = resource.sharedWith.filter((idOrEmail) => idOrEmail !== targetToRevoke);
        }
      }

      if (action === 'revoke_external' || isExternalShared === false) {
        resource.isExternalShared = false;
        resource.externalShareEmail = undefined;
      }

      db.auditLogsFor(userMode).unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'REVOKE_SHARE',
        userId: resource.ownerId,
        resourceId: id,
        details: `Revoked share permission for resource ${resource.name} (Recipient: ${targetToRevoke || 'External'})`,
      });

      return NextResponse.json({ success: true, resource, message: 'Share permission revoked cleanly.' });
    }

    if (isExternalShared !== undefined) {
      resource.isExternalShared = isExternalShared;
      if (externalShareEmail) resource.externalShareEmail = externalShareEmail;
    }

    // Handle batch targetUserIds and secrets
    if (targetUserIds && Array.isArray(targetUserIds)) {
      if (!resource.sharedWith) resource.sharedWith = [];
      const sharedWithArr = resource.sharedWith;
      targetUserIds.forEach((uid: string) => {
        if (!sharedWithArr.includes(uid)) {
          sharedWithArr.push(uid);
        }
      });
    }

    if (secrets && Array.isArray(secrets)) {
      secrets.forEach((s: any) => {
        const existingIdx = resource.secrets.findIndex((sec) => sec.userId === s.userId);
        if (existingIdx >= 0) {
          resource.secrets[existingIdx] = s;
        } else {
          resource.secrets.push(s);
        }
      });
    } else if (targetUserId && encryptedData) {
      const existingIdx = resource.secrets.findIndex((s) => s.userId === targetUserId);
      if (existingIdx >= 0) {
        resource.secrets[existingIdx] = { userId: targetUserId, encryptedData };
      } else {
        resource.secrets.push({ userId: targetUserId, encryptedData });
      }
    }

    const recipientDesc = isExternalShared
      ? `external recipient (${externalShareEmail || 'external member'})`
      : `${(targetUserIds || [targetUserId]).filter(Boolean).length || 1} team member(s)`;

    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'SHARE_RESOURCE',
      userId: resource.ownerId,
      resourceId: id,
      details: `Shared password item "${resource.name}" with ${recipientDesc} via OpenPGP re-encryption`,
    });

    return NextResponse.json({ success: true, resource });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
