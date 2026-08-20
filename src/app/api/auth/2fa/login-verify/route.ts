import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { Secret, TOTP } from 'otpauth';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export async function POST(request: Request) {
  try {
    const { email, challengeToken, code } = await request.json();
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and 2FA code are required.' }, { status: 400 });
    }

    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'No account found with this email.' }, { status: 404 });
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json({ error: '2FA is not enabled for this account.' }, { status: 400 });
    }

    // Validate challengeToken if passed
    if (challengeToken) {
      try {
        const decoded = jwt.verify(challengeToken, JWT_SECRET) as {
          is2FAChallenge?: boolean;
          userId?: string;
          passkeyCredentialId?: string;
        };
        if (!decoded || !decoded.is2FAChallenge || decoded.userId !== user.id) {
          return NextResponse.json({ error: 'Invalid or expired 2FA session. Please try logging in again.' }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: '2FA challenge token expired. Please try logging in again.' }, { status: 401 });
      }
    }

    const totp = new TOTP({
      secret: Secret.fromBase32(user.twoFactorSecret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return NextResponse.json({ error: 'Invalid 2FA code. Try again.' }, { status: 401 });
    }

    user.lastActive = 'Just now';
    persistDb(db);

    let passkeyCredentialId: string | undefined;
    if (challengeToken) {
      try {
        const decoded = jwt.verify(challengeToken, JWT_SECRET) as {
          passkeyCredentialId?: string;
        };
        passkeyCredentialId = decoded.passkeyCredentialId;
      } catch {
        // passkey credential id is optional
      }
    }

    const passkey = passkeyCredentialId
      ? user.passkeys?.find((p) => p.credentialId === passkeyCredentialId)
      : undefined;

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    db.auditLogsFor((user.accountMode || 'personal') as 'personal' | 'organization').unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'LOGIN_2FA_SUCCESS',
      userId: user.id,
      details: `User ${user.name} completed 2FA login`,
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountMode: user.accountMode || 'personal',
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
      },
      passkeyVaultKey: passkey?.encryptedPgpKey
        ? {
            prfInput: passkey.prfInput,
            prfSalt: passkey.prfSalt,
            iv: passkey.iv,
            encryptedPgpKey: passkey.encryptedPgpKey,
          }
        : null,
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
    console.error('2FA login verify error:', error);
    return NextResponse.json({ error: 'Failed to verify 2FA code' }, { status: 500 });
  }
}
