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

    const user = db.users.find((u) => u.email?.toLowerCase() === lowerEmail);

    if (!user) {
      return NextResponse.json(
        { error: 'Profile not found. Authentication succeeded but the Clickrypt account profile is missing.' },
        { status: 404 }
      );
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
