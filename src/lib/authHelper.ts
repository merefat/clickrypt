import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { db, type DbUser } from '@/lib/backendDb';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export interface AuthContext {
  user: DbUser | null;
  source: 'bearer' | 'cookie' | null;
}

function extractTokenFromHeader(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

function extractTokenFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/access_token=([^;]+)/);
  return match ? match[1].trim() : null;
}

export async function getClickryptUser(lookup: {
  authId?: string;
  userId?: string;
  email?: string;
}): Promise<DbUser | null> {
  const cleanEmail = lookup.email?.toLowerCase().trim();

  // 1. Try resolving from memory first
  let user = db.users.find(
    (u) =>
      (lookup.authId && u.authId === lookup.authId) ||
      (lookup.userId && u.id === lookup.userId) ||
      (cleanEmail && u.email?.toLowerCase().trim() === cleanEmail)
  );

  if (user) {
    // Ensure critical defaults are set
    if (!user.status) user.status = 'Active';
    if (!user.accountMode) user.accountMode = 'personal';
    return user;
  }

  // 2. Fallback to Supabase direct query
  try {
    let query = getSupabaseServer().from('users').select('id, auth_id, email, name, role, status, account_mode, data');
    if (lookup.authId) {
      query = query.eq('auth_id', lookup.authId);
    } else if (lookup.userId) {
      query = query.eq('id', lookup.userId);
    } else if (cleanEmail) {
      query = query.eq('email', cleanEmail);
    } else {
      return null;
    }

    const { data: row, error } = await query.maybeSingle();
    if (error || !row) {
      return null;
    }

    const mergedUser: DbUser = {
      status: row.status || row.data?.status || 'Active',
      role: row.role || row.data?.role || 'User',
      publicKey: '',
      encryptedPrivateKey: '',
      lastActive: 'Just now',
      ...row.data,
      id: row.id,
      email: row.email || row.data?.email,
      name: row.name || row.data?.name || (row.email ? row.email.split('@')[0] : 'User'),
      accountMode: (row.account_mode || row.data?.accountMode || 'personal') as 'personal' | 'organization',
      authId: row.auth_id || row.data?.authId,
      organizationId: row.data?.organizationId,
    };

    const existingIdx = db.users.findIndex((u) => u.id === mergedUser.id);
    if (existingIdx >= 0) {
      db.users[existingIdx] = mergedUser;
    } else {
      db.users.push(mergedUser);
    }

    return mergedUser;
  } catch (err) {
    console.error('getClickryptUser error:', err);
    return null;
  }
}

async function validateTokenAndGetUser(token: string): Promise<DbUser | null> {
  if (!token) return null;

  // 1. Try Supabase Auth token validation
  try {
    const { data: authData, error } = await getSupabaseServer().auth.getUser(token);
    if (!error && authData?.user) {
      const user = await getClickryptUser({
        authId: authData.user.id,
        email: authData.user.email,
      });
      if (user && user.status !== 'Suspended') {
        return user;
      }
    }
  } catch (e) {
    // Supabase auth check failed, fallback to custom JWT
  }

  // 2. Fallback to custom JWT verification (e.g. from 2FA login or legacy sessions)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId?: string;
      id?: string;
      email?: string;
    };
    if (decoded && (decoded.userId || decoded.id || decoded.email)) {
      const user = await getClickryptUser({
        userId: decoded.userId || decoded.id,
        email: decoded.email,
      });
      if (user && user.status !== 'Suspended') {
        return user;
      }
    }
  } catch (e) {
    // Invalid token
  }

  return null;
}

export async function getAuthContextFromRequest(request: Request): Promise<AuthContext> {
  try {
    // 1. Try Authorization header first
    const bearerToken = extractTokenFromHeader(request);
    if (bearerToken) {
      const user = await validateTokenAndGetUser(bearerToken);
      if (user) {
        return { user, source: 'bearer' };
      }
    }

    // 2. Fallback to cookie header
    const cookieToken = extractTokenFromCookie(request);
    if (cookieToken) {
      const user = await validateTokenAndGetUser(cookieToken);
      if (user) {
        return { user, source: 'cookie' };
      }
    }

    // 3. Fallback to Next.js cookie store
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get('access_token')?.value || null;
      if (token) {
        const user = await validateTokenAndGetUser(token);
        if (user) {
          return { user, source: 'cookie' };
        }
      }
    } catch {}

    return { user: null, source: null };
  } catch {
    return { user: null, source: null };
  }
}

export async function getAuthUserFromRequest(request: Request) {
  const { user } = await getAuthContextFromRequest(request);
  return user;
}
