import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { generateChallenge, isoBase64URL } from '@simplewebauthn/server/helpers';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { RP_ID } from '@/lib/config';

const CHALLENGE_TTL_MIN = 5;

export async function POST(request: Request) {
  try {
    const { email, mode } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const user = db.users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (!user) {
      return NextResponse.json(
        { error: 'No account found with this email.' },
        { status: 404 }
      );
    }

    const effectiveMode = (mode as 'personal' | 'organization') || 'personal';
    const passkeys = user.passkeys?.filter((p) => p.mode === effectiveMode) || [];
    if (passkeys.length === 0) {
      return NextResponse.json(
        { error: 'No passkey registered for this account and mode.' },
        { status: 404 }
      );
    }

    const allowCredentials = passkeys.map((p) => ({
      id: p.credentialId,
      type: 'public-key' as const,
    }));

    const challengeBuffer = await generateChallenge();
    const challenge = isoBase64URL.fromBuffer(challengeBuffer);

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      challenge: challengeBuffer,
      userVerification: 'preferred',
    });

    const evalByCredential: Record<string, { first: string }> = {};
    for (const p of passkeys) {
      if (p.prfInput) {
        evalByCredential[p.credentialId] = { first: p.prfInput };
      }
    }
    if (Object.keys(evalByCredential).length > 0) {
      (options as unknown as Record<string, unknown>).extensions = {
        prf: { evalByCredential },
      };
    }

    db.passkeyChallenges.unshift({
      id: `pkc-${Date.now()}`,
      userId: user.id,
      purpose: 'authentication',
      mode: effectiveMode,
      challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MIN * 60 * 1000).toISOString(),
    });

    persistDb(db);

    return NextResponse.json({ success: true, options });
  } catch (error) {
    console.error('Passkey login options error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate passkey login options';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
