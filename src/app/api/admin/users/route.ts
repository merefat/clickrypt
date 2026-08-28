import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sendEmail } from '@/lib/email';
import { schedulePersist } from '@/lib/dbPersistence';
import { Secret, TOTP } from 'otpauth';
import crypto from 'crypto';

function getCallerOrg(caller: any) {
  if (caller?.organizationId) {
    const org = db.organizations.find((o) => o.id === caller.organizationId);
    if (org) return org;
  }
  const emailDomain = caller?.email?.split('@')[1]?.toLowerCase();
  if (emailDomain) {
    return db.organizations.find((o) => o.domain?.toLowerCase() === emailDomain) || null;
  }
  return null;
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

  const orgDomain = org.domain?.toLowerCase();
  const orgUsers = db.users
    .filter(
      (u) =>
        u.organizationId === org.id ||
        (orgDomain && u.email?.toLowerCase().endsWith('@' + orgDomain) && u.accountMode === 'organization')
    )
    .map((u) => ({
      ...u,
      role: u.id === org.ownerId ? 'Owner' : (u.role === 'Owner' ? 'User' : u.role),
    }));

  return NextResponse.json(orgUsers);
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

    if (targetUser.role === 'Owner' || targetUser.id === org.ownerId) {
      return NextResponse.json({ error: 'Organization Owner account cannot be modified this way' }, { status: 403 });
    }

    const canModifyStatus =
      caller.role === 'Owner' ||
      (caller.role === 'Admin' && targetUser.role === 'User');
    if (!canModifyStatus) {
      return NextResponse.json({ error: 'Not allowed to modify this user' }, { status: 403 });
    }

    if (status && !['Active', 'Suspended', 'Invited'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    if (role) {
      if (role === 'Owner') {
        return NextResponse.json({ error: 'Cannot set role to Owner directly. Use ownership transfer.' }, { status: 400 });
      }
      if (!['Admin', 'User'].includes(role)) {
        return NextResponse.json({ error: 'Invalid role value' }, { status: 400 });
      }
      targetUser.role = role;
    }

    if (status) {
      if (targetUser.status === 'Invited' && status !== 'Invited') {
        return NextResponse.json(
          { error: 'Invited members cannot be activated or suspended directly. They must complete registration via their invitation link.' },
          { status: 400 }
        );
      }
      targetUser.status = status;
    }

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
    if (targetUser.email) {
      db.invitations = db.invitations.filter((i) => i.email.toLowerCase() !== targetUser.email.toLowerCase());
      await getSupabaseServer().from('invitations').delete().eq('email', targetUser.email.toLowerCase());
    }

    // Cascade delete owned resources & folders
    db.resources = db.resources.filter((r) => r.ownerId !== userId);
    db.organizationResources = db.organizationResources.filter((r) => r.ownerId !== userId);
    db.folders = db.folders.filter((f) => f.creatorId !== userId);
    db.organizationFolders = db.organizationFolders.filter((f) => f.creatorId !== userId);

    // Remove user from all groups and shared records
    db.groups.forEach((g) => {
      if (g.members) g.members = g.members.filter((m) => m.userId !== userId);
    });

    await getSupabaseServer().from('group_members').delete().eq('user_id', userId);
    await getSupabaseServer().from('resource_shares').delete().eq('recipient_id', userId);
    await getSupabaseServer().from('resources').delete().eq('owner_id', userId);
    await getSupabaseServer().from('folders').delete().eq('owner_id', userId);
    await getSupabaseServer().from('users').delete().eq('id', userId);

    if (targetUser.authId) {
      try {
        await getSupabaseServer().auth.admin.deleteUser(targetUser.authId);
      } catch (authErr) {
        console.warn('Failed to delete auth user:', authErr);
      }
    }

    const { persistDb } = await import('@/lib/dbPersistence');
    await persistDb(db);

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
