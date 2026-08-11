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
      // Default fallback to demo owner user Alex Morgan if unauthenticated for quick testing
      const defaultUser = db.users[0];
      return NextResponse.json({ user: defaultUser });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = db.users.find((u) => u.id === decoded.userId);

    if (!user) {
      return NextResponse.json({ user: db.users[0] });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ user: db.users[0] });
  }
}

export async function PUT(req: Request) {
  try {
    const { name, email, avatarUrl } = await req.json();
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;

    let targetUser = db.users[0];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        const found = db.users.find((u) => u.id === decoded.userId);
        if (found) targetUser = found;
      } catch (e) {
        // use default
      }
    }

    if (name) targetUser.name = name;
    if (email) targetUser.email = email;
    if (avatarUrl !== undefined) targetUser.avatarUrl = avatarUrl;

    return NextResponse.json({ user: targetUser, message: 'Profile updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
