import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { sendEmail } from '@/lib/email';
import { schedulePersist } from '@/lib/dbPersistence';
import { Secret, TOTP } from 'otpauth';
import crypto from 'crypto';

function getCallerOrg(caller: any) {
  return caller?.organizationId ? db.organizations.find((o) => o.id === caller.organizationId) : null;
}

export async function GET(request: Request) {
  const caller = await getAuthUserFromRequest(request);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  if (mode === 'personal') {
    return NextResponse.json([]);
  }

  const org = getCallerOrg(caller);
  if (!org) {
    return NextResponse.json([]);
  }

  return NextResponse.json(db.users.filter((u) => u.organizationId === org.id));
}

export async function PUT(request: Request) {
  try {
    const caller = await getAuthUserFromRequest(request);
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = getCallerOrg(caller);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const targetId = body.id || body.userId;
    const role = body.role;
    const status = body.status;

    const targetUser = db.users.find((u) => u.id === targetId && u.organizationId === org.id);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'Owner') {
      return NextResponse.json({ error: 'Organization Owner account cannot be modified this way' }, { status: 403 });
    }

    const canModifyStatus =
      caller.role === 'Owner' ||
      (caller.role === 'Admin' && targetUser.role === 'User');
    if (!canModifyStatus) {
      return NextResponse.json({ error: 'Not allowed to modify this user' }, { status: 403 });
    }

    if (status && !['Active', 'Suspended'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    if (role) targetUser.role = role;
    if (status) targetUser.status = status;

    schedulePersist(db);

    db.auditLogsFor('organization').unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'UPDATE_USER_ROLE',
      userId: caller.id,
      details: `Updated role/status for user ${targetUser.email}`,
    });

    return NextResponse.json(targetUser);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const caller = await getAuthUserFromRequest(request);
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = getCallerOrg(caller);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action, targetUserId, twoFactorCode, emailOtp } = body;

    if (action === 'initiate-ownership-transfer') {
      if (caller.role !== 'Owner' || caller.id !== org.ownerId) {
        return NextResponse.json({ error: 'Only the Owner can transfer ownership' }, { status: 403 });
      }

      const targetUser = db.users.find((u) => u.id === targetUserId && u.organizationId === org.id);
      if (!targetUser) {
        return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
      }

      const code = crypto.randomInt(100000, 1000000).toString();
      org.transferCode = code;
      org.transferCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      org.transferTargetId = targetUserId;
      schedulePersist(db);

      try {
        await sendEmail({
          to: caller.email,
          subject: 'Clickrypt ownership transfer code',
          text: `Your ownership transfer confirmation code is: ${code}\nThis code will expire in 10 minutes.`,
          html: `<p>Your ownership transfer confirmation code is: <strong>${code}</strong></p><p>This code will expire in 10 minutes.</p>`,
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: 'Failed to send transfer code email. Check SMTP configuration.' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, message: 'Transfer code sent to your email' });
    }

    if (action === 'confirm-ownership-transfer') {
      if (caller.role !== 'Owner' || caller.id !== org.ownerId) {
        return NextResponse.json({ error: 'Only the Owner can transfer ownership' }, { status: 403 });
      }

      if (
        !org.transferCode ||
        org.transferTargetId !== targetUserId ||
        org.transferCode !== emailOtp ||
        new Date(org.transferCodeExpiresAt || 0).getTime() < Date.now()
      ) {
        return NextResponse.json({ error: 'Invalid or expired transfer code' }, { status: 400 });
      }

      if (caller.twoFactorEnabled && caller.twoFactorSecret) {
        const totp = new TOTP({
          secret: Secret.fromBase32(caller.twoFactorSecret),
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
        });
        if (totp.validate({ token: twoFactorCode, window: 1 }) === null) {
          return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 401 });
        }
      }

      const targetUser = db.users.find((u) => u.id === targetUserId && u.organizationId === org.id);
      if (!targetUser) {
        return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
      }

      caller.role = 'Admin' as any;
      targetUser.role = 'Owner' as any;
      org.ownerId = targetUser.id;
      org.transferCode = null;
      org.transferCodeExpiresAt = null;
      org.transferTargetId = null;
      schedulePersist(db);

      db.auditLogsFor('organization').unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'OWNERSHIP_TRANSFERRED',
        userId: caller.id,
        details: `Ownership transferred to ${targetUser.email}`,
      });

      return NextResponse.json({
        success: true,
        message: 'Ownership transferred successfully',
        newOwner: targetUser,
      });
    }

    if (action === 'toggle-open-enrollment') {
      if (caller.role !== 'Owner' || caller.id !== org.ownerId) {
        return NextResponse.json({ error: 'Only the Owner can change this setting' }, { status: 403 });
      }
      org.openEnrollment = !org.openEnrollment;
      schedulePersist(db);
      return NextResponse.json({
        success: true,
        openEnrollment: org.openEnrollment,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin users POST error:', error);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const caller = await getAuthUserFromRequest(request);
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = getCallerOrg(caller);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const targetUser = db.users.find((u) => u.id === userId && u.organizationId === org.id);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'Owner') {
      return NextResponse.json({ error: 'Cannot delete the Organization Owner account.' }, { status: 403 });
    }

    const index = db.users.findIndex((u) => u.id === userId);
    if (index !== -1) {
      db.users.splice(index, 1);
    }
    schedulePersist(db);

    db.auditLogsFor('organization').unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'DELETE_USER',
      userId: caller.id,
      details: `Deleted member account ${targetUser.email} (${targetUser.role})`,
    });

    return NextResponse.json({ success: true, message: `Deleted user ${targetUser.name}` });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
