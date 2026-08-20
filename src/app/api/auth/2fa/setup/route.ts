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

    const issuer = 'Clickrypt';
    const label = user.email || 'Clickrypt User';

    if (user.twoFactorSecret) {
      // Re-use the existing secret/QR so re-enabling does not require a fresh setup
      const uri = new TOTP({
        secret: Secret.fromBase32(user.twoFactorSecret),
        label,
        issuer,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      }).toString();

      return NextResponse.json({
        success: true,
        secret: user.twoFactorSecret,
        uri,
      });
    }

    const secret = new Secret({ size: 20 });
    user.twoFactorSecret = secret.base32;
    user.twoFactorEnabled = false;
    persistDb(db);

    const uri = new TOTP({
      secret,
      label,
      issuer,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    }).toString();

    return NextResponse.json({
      success: true,
      secret: secret.base32,
      uri,
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    return NextResponse.json({ error: 'Failed to generate 2FA secret' }, { status: 500 });
  }
}
