import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getSupabaseAuthClient } from '@/lib/supabaseServer';
import { ENABLE_PAY_BILL } from '@/lib/config';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const lowerEmail = (email || '').toLowerCase().trim();

    // 1. Strict Subscription Bill Check - Block Owner, Admin & User if Bill Unpaid/Expired
    if (ENABLE_PAY_BILL && (db.subscription.status === 'Expired' || db.subscription.daysRemaining <= 0)) {
      const mode = 'organization';
      db.auditLogsFor(mode).unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'LOGIN_BLOCKED_UNPAID_BILL',
        userId: 'system',
        details: `Sign-in blocked for ${lowerEmail}. Organization subscription bill is unpaid/expired.`,
      });

      return NextResponse.json(
        {
          error: '🔒 Access Blocked: Organization subscription bill is unpaid or expired. Bill payment required before signing in.',
          unpaidBill: true,
        },
        { status: 402 }
      );
    }

    // 2. Authenticate with Supabase Auth
    const { data: signInData, error: signInError } = await getSupabaseAuthClient().auth.signInWithPassword({
      email: lowerEmail,
      password,
    });

    if (signInError || !signInData.user) {
      const authMessage = signInError?.message || 'Invalid email or password.';
      console.error('Supabase sign-in error:', authMessage);
      return NextResponse.json(
        { error: authMessage },
        { status: 401 }
      );
    }

    let user = db.users.find((u) => u.email?.toLowerCase() === lowerEmail);

    // Fallback: If not in memory yet, query Supabase public.users directly
    if (!user) {
      const { getSupabaseServer } = await import('@/lib/supabaseServer');
      const { data: row } = await getSupabaseServer()
        .from('users')
        .select('id, auth_id, email, name, role, status, account_mode, data')
        .eq('email', lowerEmail)
        .maybeSingle();

      if (row) {
        user = {
          ...row.data,
          status: row.status || row.data?.status || 'Active',
          role: row.role || row.data?.role || 'User',
          id: row.id,
          email: row.email,
          name: row.name,
          accountMode: row.account_mode,
          authId: row.auth_id || row.data?.authId || signInData.user.id,
          organizationId: row.data?.organizationId || (row as any).organization_id || null,
        } as any;
        if (user) db.users.push(user);
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Profile not found. Authentication succeeded but the Clickrypt account profile is missing.' },
        { status: 404 }
      );
    }

    // Auto-link authId if missing
    if (!user.authId && signInData.user?.id) {
      user.authId = signInData.user.id;
      const { persistDb } = await import('@/lib/dbPersistence');
      persistDb(db).catch((e) => console.warn('Failed to auto-persist authId:', e));
    }

    const userMode = (user.accountMode || 'personal') as 'personal' | 'organization';

    // 3. Individual Account Suspension Check
    if (user.status === 'Suspended') {
      db.auditLogsFor(userMode).unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'LOGIN_BLOCKED_SUSPENDED',
        userId: user.id,
        details: `Login blocked for suspended account ${user.email}`,
      });
      return NextResponse.json(
        { error: 'Account suspended. You are blocked from accessing Clickrypt vault.' },
        { status: 403 }
      );
    }

    // 4. 2FA Challenge
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const challengeToken = jwt.sign(
        { userId: user.id, email: user.email, is2FAChallenge: true },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return NextResponse.json({
        success: true,
        requires2FA: true,
        challengeToken,
        email: user.email,
      });
    }

    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'LOGIN_SUCCESS',
      userId: user.id,
      details: `User ${user.name} logged in`,
    });

    const response = NextResponse.json({
      success: true,
      token: signInData.session!.access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountMode: user.accountMode || 'personal',
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
      },
    });

    response.cookies.set('access_token', signInData.session!.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
