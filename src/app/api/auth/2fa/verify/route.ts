import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';
import { Secret, TOTP } from 'otpauth';

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = db.users.find((u) => u.id === authUser.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { code } = await request.json();
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Please enter a valid 6-digit code.' }, { status: 400 });
    }

    if (!user.twoFactorSecret) {
      return NextResponse.json({ error: '2FA not set up. Please configure 2FA first.' }, { status: 400 });
    }

    const totp = new TOTP({
      secret: Secret.fromBase32(user.twoFactorSecret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 401 });
    }

    user.twoFactorEnabled = true;
    persistDb(db);

    return NextResponse.json({ success: true, message: 'Two-Factor Authentication enabled.' });
  } catch (error) {
    console.error('2FA verify error:', error);
    return NextResponse.json({ error: 'Failed to verify 2FA code' }, { status: 500 });
  }
}
