import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/backendDb';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export async function getAuthUserFromRequest(request: Request) {
  try {
    // 1. Try Authorization header first (tab-isolated session token)
    const authHeader = request.headers.get('authorization');
    let token: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // 2. Fallback to cookie header or cookieStore
    if (!token) {
      const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie') || '';
      const match = cookieHeader.match(/access_token=([^;]+)/);
      if (match) {
        token = match[1];
      } else {
        try {
          const cookieStore = await cookies();
          token = cookieStore.get('access_token')?.value || null;
        } catch (e) {}
      }
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const user = db.users.find((u) => u.id === decoded.userId);
      if (user) return user;
    }

    return db.users[0] || null;
  } catch {
    return db.users[0] || null;
  }
}
