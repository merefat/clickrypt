import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/backendDb';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = db.users.find((u) => u.id === decoded.userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function PUT(req: Request) {
  try {
    const { name, email, avatarUrl } = await req.json();
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const targetUser = db.users.find((u) => u.id === decoded.userId);

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (name) targetUser.name = name;
    if (email) targetUser.email = email;
    if (avatarUrl !== undefined) targetUser.avatarUrl = avatarUrl;

    return NextResponse.json({ user: targetUser, message: 'Profile updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
