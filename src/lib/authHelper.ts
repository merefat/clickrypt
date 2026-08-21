import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { db, type DbUser } from '@/lib/backendDb';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export interface AuthContext {
  user: DbUser | null;
  source: 'bearer' | 'cookie' | null;
}

export async function getAuthContextFromRequest(request: Request): Promise<AuthContext> {
  try {
    // 1. Try Authorization header first (tab-isolated session token)
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const user = db.users.find((u) => u.id === decoded.userId);
      // Global suspension guard: a suspended token is treated as unauthenticated
      if (user && user.status !== 'Suspended') return { user, source: 'bearer' };
      return { user: null, source: 'bearer' };
    }

    // 2. Fallback to cookie header
    const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie') || '';
    const match = cookieHeader.match(/access_token=([^;]+)/);
    if (match) {
      const token = match[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const user = db.users.find((u) => u.id === decoded.userId);
      if (user && user.status !== 'Suspended') return { user, source: 'cookie' };
      return { user: null, source: 'cookie' };
    }

    // 3. Fallback to cookie store
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get('access_token')?.value || null;
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        const user = db.users.find((u) => u.id === decoded.userId);
        if (user && user.status !== 'Suspended') return { user, source: 'cookie' };
        return { user: null, source: 'cookie' };
      }
    } catch (e) {}

    return { user: null, source: null };
  } catch {
    return { user: null, source: null };
  }
}

export async function getAuthUserFromRequest(request: Request) {
  const { user } = await getAuthContextFromRequest(request);
  return user;
}
