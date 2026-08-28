import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthContextFromRequest } from '@/lib/authHelper';
import { encryptSecret, safeBase64Decode } from '@/lib/crypto';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { persistDb } from '@/lib/dbPersistence';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: authUser } = await getAuthContextFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { action, revokeUserId, targetUserId, targetUserIds, encryptedData, secrets, isExternalShared, externalShareEmail, externalShareLink } = body;

    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    let resource = db.resourcesFor(userMode).find((r) => r.id === id);
    if (!resource) {
      resource = db.resources.find((r) => r.id === id) || db.organizationResources.find((r) => r.id === id);
    }
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Only the resource owner can share or revoke it
    if (resource.ownerId !== authUser.id) {
      return NextResponse.json({ error: 'Forbidden: Only the owner can share this item' }, { status: 403 });
    }

    // REVOCATION ACTION: Revoke sharing for a specific user ID or external share
    if (action === 'revoke' || revokeUserId || action === 'revoke_external' || isExternalShared === false) {
      const targetToRevoke = revokeUserId || targetUserId;
      if (targetToRevoke) {
        resource.secrets = resource.secrets.filter(
          (s: any) => s.userId !== targetToRevoke && s.email?.toLowerCase() !== targetToRevoke.toLowerCase()
        );
        if (resource.sharedWith) {
          resource.sharedWith = resource.sharedWith.filter((idOrEmail) => idOrEmail !== targetToRevoke && idOrEmail.toLowerCase() !== targetToRevoke.toLowerCase());
        }
      }

      if (action === 'revoke_external' || isExternalShared === false) {
        const revokedEmail = resource.externalShareEmail;
        resource.isExternalShared = false;
        resource.externalShareEmail = undefined;
        if (revokedEmail && resource.sharedWith) {
          resource.sharedWith = resource.sharedWith.filter((e) => e.toLowerCase() !== revokedEmail.toLowerCase());
        }
        if (revokedEmail && resource.secrets) {
          resource.secrets = resource.secrets.filter((s: any) => s.email?.toLowerCase() !== revokedEmail.toLowerCase());
        }
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
      await persistDb(db);

      return NextResponse.json({ success: true, resource, message: 'Share permission revoked cleanly.' });
    }

    let emailSent = false;
    let emailError: string | undefined;

    if (isExternalShared !== undefined) {
      resource.isExternalShared = isExternalShared;
      if (externalShareEmail) {
        const cleanEmail = externalShareEmail.trim().toLowerCase();
        resource.externalShareEmail = cleanEmail;
        if (!resource.sharedWith) resource.sharedWith = [];
        if (!resource.sharedWith.includes(cleanEmail)) {
          resource.sharedWith.push(cleanEmail);
        }
      }

      // Attempt to email the external recipient the secure registration/view link
      if (isExternalShared && externalShareEmail && externalShareLink) {
        const cleanEmail = externalShareEmail.trim().toLowerCase();
        const mailResult = await sendEmail({
          to: cleanEmail,
          subject: `Secure Password Shared With You: ${resource.name} on ClicKrypt`,
          text: `Hello,\n\n${authUser.name || authUser.email} has shared the encrypted password for "${resource.name}" with you on ClicKrypt.\n\nOpen this link to securely view and decrypt the shared password:\n${externalShareLink}\n\nThis item is protected with zero-knowledge end-to-end encryption.`,
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="utf-8"><title>Shared Secret Invitation</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 32px 16px;">
              <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div style="background: linear-gradient(135deg, #0284c7 0%, #0f172a 100%); padding: 32px 24px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">ClicKrypt</h1>
                  <p style="color: #93c5fd; margin: 6px 0 0 0; font-size: 13px; font-weight: 600;">Zero-Knowledge Encrypted Sharing</p>
                </div>
                <div style="padding: 32px 28px;">
                  <h2 style="color: #0f172a; font-size: 18px; margin: 0 0 12px 0; font-weight: 700;">Password Shared With You</h2>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                    <strong>${authUser.name || authUser.email}</strong> has shared a secure password item (<strong>${resource.name}</strong>) with you on ClicKrypt.
                  </p>
                  <div style="text-align: center; margin: 28px 0;">
                    <a href="${externalShareLink}" style="background: linear-gradient(135deg, #f39c12 0%, #1fbbd2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                      View Shared Password →
                    </a>
                  </div>
                  <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0 0 8px 0;">
                    Or copy and paste this link into your browser:<br/>
                    <a href="${externalShareLink}" style="color: #0284c7; word-break: break-all;">${externalShareLink}</a>
                  </p>
                </div>
                <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
                  <p style="color: #94a3b8; font-size: 11px; margin: 0;">
                    © ${new Date().getFullYear()} ClicKrypt • Zero-Knowledge Enterprise Vault
                  </p>
                </div>
              </div>
            </body>
            </html>
          `,
        });

        emailSent = mailResult.success;
        if (!mailResult.success) {
          emailError = mailResult.error;
        }
      }
    }

    // Handle batch targetUserIds
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
        const existingIdx = resource.secrets.findIndex(
          (sec: any) => (s.userId && sec.userId === s.userId) || (s.email && sec.email?.toLowerCase() === s.email.toLowerCase())
        );
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
    await persistDb(db);

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
