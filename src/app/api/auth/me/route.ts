import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ user: null }, { status: 200, headers: NO_CACHE_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const mode = (searchParams.get('mode') as 'personal' | 'organization') || user.accountMode || 'personal';

    const modeProfile = mode === 'personal' ? user.personalProfile : user.organizationProfile;
    let organization = user.organizationId ? db.organizations.find((o) => o.id === user.organizationId) : null;
    if (!organization && user.email) {
      const emailDomain = user.email.split('@')[1]?.toLowerCase();
      if (emailDomain) {
        organization = db.organizations.find((o) => o.domain?.toLowerCase() === emailDomain) || null;
      }
    }
    if (organization && !user.organizationId) {
      user.organizationId = organization.id;
    }
    const effectiveUser = {
      ...user,
      name: modeProfile?.name || user.name,
      email: modeProfile?.email || user.email,
      avatarUrl: modeProfile?.avatarUrl !== undefined ? modeProfile.avatarUrl : user.avatarUrl,
      accountMode: user.accountMode || 'personal',
      organizationId: organization?.id || user.organizationId,
      organization: organization
        ? {
            id: organization.id,
            domain: organization.domain,
            verificationStatus: organization.verificationStatus,
            openEnrollment: organization.openEnrollment,
          }
        : null,
    };

    return NextResponse.json({ user: effectiveUser }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error('/api/auth/me error:', error);
    return NextResponse.json({ user: null }, { status: 200, headers: NO_CACHE_HEADERS });
  }
}

export async function PUT(request: Request) {
  try {
    const { name, email, avatarUrl, mode, publicKey, encryptedPrivateKey } = await request.json();
    const targetUser = await getAuthUserFromRequest(request);

    if (!targetUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const activeMode = (mode as 'personal' | 'organization') || targetUser.accountMode || 'personal';

    if (name) targetUser.name = name;
    if (email) targetUser.email = email;
    if (avatarUrl !== undefined) targetUser.avatarUrl = avatarUrl;
    if (publicKey) targetUser.publicKey = publicKey;
    if (encryptedPrivateKey) targetUser.encryptedPrivateKey = encryptedPrivateKey;

    if (activeMode === 'personal') {
      if (!targetUser.personalProfile) targetUser.personalProfile = {};
      if (name) targetUser.personalProfile.name = name;
      if (email) targetUser.personalProfile.email = email;
      if (avatarUrl !== undefined) targetUser.personalProfile.avatarUrl = avatarUrl;
    } else {
      if (!targetUser.organizationProfile) targetUser.organizationProfile = {};
      if (name) targetUser.organizationProfile.name = name;
      if (email) targetUser.organizationProfile.email = email;
      if (avatarUrl !== undefined) targetUser.organizationProfile.avatarUrl = avatarUrl;
    }

    const modeProfile = activeMode === 'personal' ? targetUser.personalProfile : targetUser.organizationProfile;
    const effectiveUser = {
      ...targetUser,
      name: modeProfile?.name || targetUser.name,
      email: modeProfile?.email || targetUser.email,
      avatarUrl: modeProfile?.avatarUrl !== undefined ? modeProfile.avatarUrl : targetUser.avatarUrl,
    };

    await persistDb(db);

    return NextResponse.json(
      { user: effectiveUser, message: 'Profile updated successfully' },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const targetUser = await getAuthUserFromRequest(request);

    if (!targetUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_CACHE_HEADERS });
    }

    if (targetUser.role === 'Owner') {
      return NextResponse.json(
        { error: 'Organization owners must transfer ownership before deleting their account.' },
        { status: 403, headers: NO_CACHE_HEADERS }
      );
    }

    db.users = db.users.filter((u) => u.id !== targetUser.id);
    db.resources = db.resources.filter((r) => r.ownerId !== targetUser.id);
    db.folders = db.folders.filter((f) => f.creatorId !== targetUser.id);
    db.auditLogs = db.auditLogs.filter((l) => l.userId !== targetUser.id);

    if (targetUser.organizationId) {
      db.organizationResources = db.organizationResources.filter((r) => r.ownerId !== targetUser.id);
      db.organizationFolders = db.organizationFolders.filter((f) => f.creatorId !== targetUser.id);
      db.organizationAuditLogs = db.organizationAuditLogs.filter((l) => l.userId !== targetUser.id);
      db.groups = db.groups.map((g) => ({ ...g, members: g.members.filter((m) => m.userId !== targetUser.id) }));
    }

    await persistDb(db);

    return NextResponse.json(
      { success: true, message: 'Account deleted successfully' },
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
