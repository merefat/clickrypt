import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { generateChallenge, isoBase64URL } from '@simplewebauthn/server/helpers';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { RP_NAME, RP_ID } from '@/lib/config';

const CHALLENGE_TTL_MIN = 5;

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mode =
      (request.headers.get('x-app-mode') as 'personal' | 'organization') ||
      'personal';

    const existing = user.passkeys?.filter((p) => p.mode === mode) || [];
    const excludeCredentials = existing.map((p) => ({
      id: p.credentialId,
      type: 'public-key' as const,
    }));

    const challengeBuffer = await generateChallenge();
    const challenge = isoBase64URL.fromBuffer(challengeBuffer);
    const prfInput = isoBase64URL.fromBuffer(await generateChallenge());

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: user.name,
      challenge: challengeBuffer,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'discouraged',
        userVerification: 'preferred',
      },
    });

    (options as unknown as Record<string, unknown>).extensions = {
      prf: {
        eval: {
          first: prfInput,
        },
      },
    };

    db.passkeyChallenges.unshift({
      id: `pkc-${Date.now()}`,
      userId: user.id,
      purpose: 'registration',
      mode,
      challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MIN * 60 * 1000).toISOString(),
    });

    persistDb(db);

    return NextResponse.json({ success: true, options, prfInput });
  } catch (error) {
    console.error('Passkey register options error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate passkey registration options';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
