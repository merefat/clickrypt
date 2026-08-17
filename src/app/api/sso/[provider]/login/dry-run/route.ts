import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const body = await req.json();
    const { draftSettingId, adminUserId } = body;

    let draftSetting =
      db.ssoSettings.find((s) => s.id === draftSettingId) ||
      db.ssoSettings.find(
        (s) =>
          s.provider === provider ||
          s.provider.toLowerCase().includes(provider.toLowerCase()) ||
          provider.toLowerCase().includes(s.provider.toLowerCase())
      );

    if (!draftSetting) {
      draftSetting = {
        id: draftSettingId || `sso-set-${Date.now()}`,
        provider: provider as any,
        data: JSON.stringify({ clientId: 'demo-client-id', clientSecret: 'demo-client-secret' }),
        status: 'draft',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      };
      db.ssoSettings.push(draftSetting);
    }

    const nonce = `dry-nonce-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const state = `dry-state-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString(); // 10 MINUTES

    db.ssoStates.push({
      id: `dry-state-rec-${Date.now()}`,
      nonce,
      type: 'sso_set_settings',
      state,
      ssoSettingsId: draftSetting.id,
      userId: adminUserId || 'u-1',
      createdAt: new Date().toISOString(),
      expiresAt,
    });

    const redirectUrl = `/api/sso/${provider}/redirect?code=demo_dry_code_${Date.now()}&state=${state}`;
    const response = NextResponse.json({ url: redirectUrl, state });

    response.cookies.set('sso_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
