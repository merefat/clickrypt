import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { type DbUser } from '@/lib/backendDb';

export interface AuthContext {
  user: DbUser | null;
  source: 'bearer' | 'cookie' | null;
}

function extractTokenFromHeader(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function extractTokenFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/access_token=([^;]+)/);
  return match ? match[1] : null;
}

async function getClickryptUser(authId: string): Promise<DbUser | null> {
  const { data: row, error } = await getSupabaseServer()
    .from('users')
    .select('id, auth_id, data')
    .eq('auth_id', authId)
    .single();

  if (error || !row) {
    return null;
  }

  const user = row.data as DbUser;
  user.id = row.id;
  user.authId = row.auth_id || row.data?.authId;
  return user;
}

export async function getAuthContextFromRequest(request: Request): Promise<AuthContext> {
  try {
    // 1. Try Authorization header first
    const bearerToken = extractTokenFromHeader(request);
    if (bearerToken) {
      const { data: authData, error } = await getSupabaseServer().auth.getUser(bearerToken);
      if (!error && authData?.user) {
        const user = await getClickryptUser(authData.user.id);
        if (user && user.status !== 'Suspended') {
          return { user, source: 'bearer' };
        }
        return { user: null, source: 'bearer' };
      }
    }

    // 2. Fallback to cookie header
    const cookieToken = extractTokenFromCookie(request);
    if (cookieToken) {
      const { data: authData, error } = await getSupabaseServer().auth.getUser(cookieToken);
      if (!error && authData?.user) {
        const user = await getClickryptUser(authData.user.id);
        if (user && user.status !== 'Suspended') {
          return { user, source: 'cookie' };
        }
        return { user: null, source: 'cookie' };
      }
    }

    // 3. Fallback to cookie store
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get('access_token')?.value || null;
      if (token) {
        const { data: authData, error } = await getSupabaseServer().auth.getUser(token);
        if (!error && authData?.user) {
          const user = await getClickryptUser(authData.user.id);
          if (user && user.status !== 'Suspended') {
            return { user, source: 'cookie' };
          }
          return { user: null, source: 'cookie' };
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
