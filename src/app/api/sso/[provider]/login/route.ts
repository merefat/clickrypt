import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const body = await req.json();
    const { userId, email } = body;

    const user = db.users.find((u) => u.id === userId || u.email.toLowerCase() === email?.toLowerCase());
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const activeSetting = db.ssoSettings.find((s) => s.provider === provider && s.status === 'active');
    if (!activeSetting) {
      return NextResponse.json({ error: `SSO is not currently active for provider ${provider}` }, { status: 400 });
    }

    const nonce = `nonce-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const state = `state-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString(); // 10 MINUTES EXPIRY

    db.ssoStates.push({
      id: `state-rec-${Date.now()}`,
      nonce,
      type: 'sso_get_key',
      state,
      ssoSettingsId: activeSetting.id,
      userId: user.id,
      userAgent: req.headers.get('user-agent') || 'browser',
      ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      createdAt: new Date().toISOString(),
      expiresAt,
    });

    const authorizeUrl = `/api/sso/${provider}/redirect?code=demo_code_${Date.now()}&state=${state}`;

    const response = NextResponse.json({ url: authorizeUrl, state });

    // SET DEDICATED sso_state COOKIE (ISOLATED FROM SESSION JWT)
    response.cookies.set('sso_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
