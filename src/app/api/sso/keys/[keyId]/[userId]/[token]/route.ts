import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ keyId: string; userId: string; token: string }> }
) {
  try {
    const { keyId, userId, token } = await params;

    // Validate sso_token
    const tokenRecord = db.ssoTokens.find(
      (t) => t.token === token && t.userId === userId && t.active && t.type === 'sso_get_key'
    );

    // Generic non-enumerating error check
    if (!tokenRecord) {
      return NextResponse.json({ error: 'Invalid SSO key request or token' }, { status: 400 });
    }

    if (new Date(tokenRecord.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invalid SSO key request or token' }, { status: 400 });
    }

    const keyRecord = db.ssoKeys.find((k) => k.userId === userId);
    if (!keyRecord) {
      return NextResponse.json({ error: 'Invalid SSO key request or token' }, { status: 400 });
    }

    // Consume single-use token
    tokenRecord.active = false;

    return NextResponse.json({
      success: true,
      data: keyRecord.data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid SSO key request or token' }, { status: 400 });
  }
}
