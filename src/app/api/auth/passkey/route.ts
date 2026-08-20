import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mode =
      (request.headers.get('x-app-mode') as 'personal' | 'organization') ||
      'personal';

    const passkeys = (user.passkeys || [])
      .filter((p) => p.mode === mode)
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: 'WebAuthn FIDO2 Credential',
        createdAt: p.createdAt,
        lastUsed: p.lastUsed,
      }));

    return NextResponse.json({ success: true, passkeys });
  } catch (error) {
    console.error('Passkey list error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list passkeys';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
