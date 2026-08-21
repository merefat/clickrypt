import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { RP_ID } from '@/lib/config';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export async function POST(request: Request) {
  try {
    const { email, mode, response } = await request.json();
    if (!email || !response || !response.id) {
      return NextResponse.json(
        { error: 'Email and passkey response are required.' },
        { status: 400 }
      );
    }

    const effectiveMode = (mode as 'personal' | 'organization') || 'personal';

    const user = db.users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email.' },
        { status: 404 }
      );
    }

    if (user.status === 'Suspended') {
      db.auditLogsFor(effectiveMode).unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'LOGIN_BLOCKED_SUSPENDED',
        userId: user.id,
        details: `Passkey login blocked for suspended account ${user.email}`,
      });
      return NextResponse.json(
        { error: 'Account suspended. You are blocked from accessing Clickrypt vault.' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    const record = db.passkeyChallenges.find(
      (c) =>
        c.userId === user.id &&
        c.purpose === 'authentication' &&
        c.mode === effectiveMode &&
        new Date(c.expiresAt) > new Date(now)
    );

    if (!record) {
      return NextResponse.json(
        { error: 'Passkey login challenge expired or missing.' },
        { status: 400 }
      );
    }

    const passkey = user.passkeys?.find(
      (p) => p.mode === effectiveMode && p.credentialId === response.id
    );
    if (!passkey) {
      return NextResponse.json(
        { error: 'This passkey is not registered for the selected mode.' },
        { status: 401 }
      );
    }

    const expectedOrigin =
      request.headers.get('origin') ||
      (RP_ID === 'localhost'
        ? 'http://localhost:3000'
        : `https://${RP_ID}`);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: record.challenge,
      expectedOrigin,
      expectedRPID: new URL(expectedOrigin).hostname,
      credential: {
        id: passkey.credentialId,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
      },
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return NextResponse.json(
        { error: 'Passkey authentication failed.' },
        { status: 401 }
      );
    }

    passkey.counter = verification.authenticationInfo.newCounter;
    passkey.lastUsed = now;
    db.passkeyChallenges = db.passkeyChallenges.filter((c) => c.id !== record.id);
    user.lastActive = 'Just now';
    persistDb(db);

    db.auditLogsFor(effectiveMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: now,
      action: 'PASSKEY_LOGIN_SUCCESS',
      userId: user.id,
      details: `Passkey login for ${user.email} in ${effectiveMode} mode`,
    });
    persistDb(db);

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const challengeToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          is2FAChallenge: true,
          passkeyCredentialId: passkey.credentialId,
        },
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

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const res = NextResponse.json({
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
      passkeyVaultKey: passkey.encryptedPgpKey
        ? {
            prfInput: passkey.prfInput,
            prfSalt: passkey.prfSalt,
            iv: passkey.iv,
            encryptedPgpKey: passkey.encryptedPgpKey,
          }
        : null,
    });

    res.cookies.set('access_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error) {
    console.error('Passkey login error:', error);
    const message = error instanceof Error ? error.message : 'Passkey login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
