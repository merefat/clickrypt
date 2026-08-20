import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { RP_ID } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      response,
      name,
      prfInput,
      prfSalt,
      iv,
      encryptedPgpKey,
    } = await request.json();
    const mode =
      (request.headers.get('x-app-mode') as 'personal' | 'organization') ||
      'personal';
    const now = new Date().toISOString();

    const record = db.passkeyChallenges.find(
      (c) =>
        c.userId === user.id &&
        c.purpose === 'registration' &&
        c.mode === mode &&
        new Date(c.expiresAt) > new Date(now)
    );

    if (!record) {
      return NextResponse.json(
        { error: 'Passkey registration challenge expired or missing.' },
        { status: 400 }
      );
    }

    const expectedOrigin =
      request.headers.get('origin') ||
      (RP_ID === 'localhost'
        ? 'http://localhost:3000'
        : `https://${RP_ID}`);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: record.challenge,
      expectedOrigin,
      expectedRPID: new URL(expectedOrigin).hostname,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: 'Passkey verification failed.' },
        { status: 400 }
      );
    }

    const info = verification.registrationInfo;
    const credentialId = info.credential.id;
    const publicKey = isoBase64URL.fromBuffer(info.credential.publicKey);

    if (!user.passkeys) user.passkeys = [];

    user.passkeys.push({
      id: `pk-${Date.now()}`,
      credentialId,
      publicKey,
      counter: info.credential.counter,
      name: name?.trim() || 'Passkey',
      mode,
      transports: info.credential.transports || ['internal'],
      createdAt: now,
      lastUsed: now,
      prfInput: typeof prfInput === 'string' ? prfInput : undefined,
      prfSalt: typeof prfSalt === 'string' ? prfSalt : undefined,
      iv: typeof iv === 'string' ? iv : undefined,
      encryptedPgpKey: typeof encryptedPgpKey === 'string' ? encryptedPgpKey : undefined,
    });

    db.passkeyChallenges = db.passkeyChallenges.filter((c) => c.id !== record.id);
    user.lastActive = 'Just now';

    persistDb(db);

    db.auditLogsFor(mode).unshift({
      id: `al-${Date.now()}`,
      timestamp: now,
      action: 'PASSKEY_REGISTRATION_SUCCESS',
      userId: user.id,
      details: `Passkey registered for ${user.email} in ${mode} mode`,
    });
    persistDb(db);

    const newPasskey = user.passkeys[user.passkeys.length - 1];
    return NextResponse.json({
      success: true,
      passkey: {
        ...newPasskey,
        type: 'WebAuthn FIDO2 Credential',
      },
    });
  } catch (error) {
    console.error('Passkey register error:', error);
    const message = error instanceof Error ? error.message : 'Failed to register passkey';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
