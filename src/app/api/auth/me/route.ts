import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const { name, email, avatarUrl } = await request.json();
    const targetUser = await getAuthUserFromRequest(request);

    if (!targetUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (name) targetUser.name = name;
    if (email) targetUser.email = email;
    if (avatarUrl !== undefined) targetUser.avatarUrl = avatarUrl;

    return NextResponse.json({ user: targetUser, message: 'Profile updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
