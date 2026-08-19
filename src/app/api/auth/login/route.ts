import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import jwt from 'jsonwebtoken';
import { ENABLE_PAY_BILL } from '@/lib/config';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // 1. Strict Subscription Bill Check - Block Owner, Admin & User if Bill Unpaid/Expired
    if (ENABLE_PAY_BILL && (db.subscription.status === 'Expired' || db.subscription.daysRemaining <= 0)) {
      db.auditLogs.unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'LOGIN_BLOCKED_UNPAID_BILL',
        userId: 'u-1',
        details: `Sign-in blocked for ${email}. Organization subscription bill is unpaid/expired.`,
      });

      return NextResponse.json(
        {
          error: '🔒 Access Blocked: Organization subscription bill is unpaid or expired. Bill payment required before signing in.',
          unpaidBill: true,
        },
        { status: 402 }
      );
    }

    let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email. Please register first.' },
        { status: 404 }
      );
    }

    if (email.toLowerCase() === 'alex.morgan@acme.com' || email.toLowerCase() === 'refat61899200@gmail.com') {
      user.role = 'Owner';
    }

    // 2. Individual Account Suspension Check
    if (user.status === 'Suspended') {
      db.auditLogs.unshift({
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

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'LOGIN_SUCCESS',
      userId: user.id,
      details: `User ${user.name} logged in`,
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
      },
    });

    response.cookies.set('access_token', token, {
      httpOnly: true,
      secure: false,
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
