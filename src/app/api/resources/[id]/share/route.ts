import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthContextFromRequest } from '@/lib/authHelper';
import { encryptSecret, safeBase64Decode } from '@/lib/crypto';
import { isEmailConfigured, sendEmail } from '@/lib/email';

function decodeBase64Fallback(secrets: any[]): string | null {
  const fallback = secrets.find((s) => s?.encryptedData?.startsWith('[PGP-ENCRYPTED-BLOB::'));
  if (!fallback) return null;
  const decoded = safeBase64Decode(fallback.encryptedData);
  if (!decoded || decoded.startsWith('[PGP-ENCRYPTED-BLOB::') || decoded.includes('-----BEGIN PGP MESSAGE-----')) {
    return null;
  }
  return decoded;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: authUser, source } = await getAuthContextFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { action, revokeUserId, targetUserId, targetUserIds, encryptedData, secrets, isExternalShared, externalShareEmail, externalShareLink } = body;

    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    const resource = db.resourcesFor(userMode).find((r) => r.id === id);
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Only the resource owner can share or revoke it
    if (resource.ownerId !== authUser.id) {
      console.error('[SHARE 403]', {
        resourceId: id,
        resourceName: resource.name,
        ownerId: resource.ownerId,
        authUserId: authUser.id,
        authUserEmail: authUser.email,
        tokenSource: source,
        userMode,
      });
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

      resource.lastModified = new Date().toISOString();
      return NextResponse.json({ success: true, resource, message: 'Share permission revoked cleanly.' });
    }

    let emailSent = false;
    let emailError: string | undefined;

    if (isExternalShared !== undefined) {
      resource.isExternalShared = isExternalShared;
      if (externalShareEmail) resource.externalShareEmail = externalShareEmail;

      // Attempt to email the external recipient the secure registration link
      if (isExternalShared && externalShareEmail && externalShareLink) {
        if (!isEmailConfigured()) {
          emailError = 'Email delivery is not configured on this server. Please copy the link and send it manually.';
        } else {
          try {
            await sendEmail({
              to: externalShareEmail,
              subject: `You've been invited to access a secure item on Clickrypt`,
              text: `A secure item has been shared with you on Clickrypt. Register or log in using this unique link: ${externalShareLink}`,
              html: `<p>A secure item has been shared with you on <strong>Clickrypt</strong>.</p><p>Click the link below to register or log in and view it in your <em>Shared with Me</em> panel:</p><p><a href="${externalShareLink}">${externalShareLink}</a></p>`,
            });
            emailSent = true;
          } catch (err: any) {
            emailError = err.message || 'Failed to send invitation email. Please copy the link and send it manually.';
          }
        }
      }
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

    // Ensure the resource owner always has a usable secret after sharing
    const plainText = body.password;
    if (plainText) {
      const resourceOwner = db.users.find((u) => u.id === resource.ownerId);
      if (resourceOwner?.publicKey) {
        const hasOwnerSecret = resource.secrets.some((s) => s.userId === resource.ownerId);
        const ownerEncryptedData = await encryptSecret(plainText, resourceOwner.publicKey);
        if (hasOwnerSecret) {
          const existing = resource.secrets.find((s) => s.userId === resource.ownerId);
          if (existing) existing.encryptedData = ownerEncryptedData;
        } else {
          resource.secrets.push({ userId: resource.ownerId, encryptedData: ownerEncryptedData });
        }
      }
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

    resource.lastModified = new Date().toISOString();
    const response: any = { success: true, resource };
    if (isExternalShared !== undefined) {
      response.emailSent = emailSent;
      if (emailError) response.emailError = emailError;
    }
    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
