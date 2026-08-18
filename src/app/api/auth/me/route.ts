import { NextResponse } from 'next/server';
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
    const mode = searchParams.get('mode') || 'organization';

    const modeProfile = mode === 'personal' ? user.personalProfile : user.organizationProfile;
    const effectiveUser = {
      ...user,
      name: modeProfile?.name || user.name,
      email: modeProfile?.email || user.email,
      avatarUrl: modeProfile?.avatarUrl !== undefined ? modeProfile.avatarUrl : user.avatarUrl,
    };

    return NextResponse.json({ user: effectiveUser }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json({ user: null }, { status: 200, headers: NO_CACHE_HEADERS });
  }
}

export async function PUT(request: Request) {
  try {
    const { name, email, avatarUrl, mode } = await request.json();
    const targetUser = await getAuthUserFromRequest(request);

    if (!targetUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const activeMode = mode || 'organization';

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

    return NextResponse.json(
      { user: effectiveUser, message: 'Profile updated successfully' },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
