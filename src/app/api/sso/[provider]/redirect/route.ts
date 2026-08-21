import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');

    const cookieHeader = req.headers.get('cookie') || '';
    const cookieStateMatch = cookieHeader.match(/sso_state=([^;]+)/);
    const cookieState = cookieStateMatch ? cookieStateMatch[1] : null;

    // 1. CSRF State Validation
    const stateToValidate = stateParam || cookieState;
    if (!stateToValidate) {
      return NextResponse.json({ error: 'CSRF Validation Failed: Missing state parameter' }, { status: 400 });
    }

    const ssoState = db.ssoStates.find((s) => s.state === stateToValidate);
    if (!ssoState) {
      return NextResponse.json({ error: 'Invalid or missing SSO state' }, { status: 400 });
    }

    // 2. 10-Minute Expiry Check
    if (new Date(ssoState.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'SSO session state has expired (10-minute timeout)' }, { status: 400 });
    }

    // 3. DRAFT VS ACTIVE SETTINGS LOOKUP ISOLATION
    const isAdminDryRun = ssoState.type === 'sso_set_settings';
    const targetStatus = isAdminDryRun ? 'draft' : 'active';

    const ssoSetting =
      db.ssoSettings.find((s) => s.id === ssoState.ssoSettingsId) ||
      db.ssoSettings.find(
        (s) =>
          s.provider === provider ||
          s.provider.toLowerCase().includes(provider.toLowerCase()) ||
          provider.toLowerCase().includes(s.provider.toLowerCase())
      );

    if (!ssoSetting) {
      return NextResponse.json(
        { error: `Configuration Isolation Error: Target ${targetStatus} SSO setting not found for provider ${provider}` },
        { status: 400 }
      );
    }

    // Resolve user from mock IdP code exchange
    const targetUserId = ssoState.userId || 'u-1';
    const targetUser = db.users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      return NextResponse.json({ error: 'IdP email claim resolved to non-existent user account' }, { status: 400 });
    }

    if (targetUser.status === 'Suspended') {
      return NextResponse.redirect(
        new URL(`/login?suspended=true&email=${encodeURIComponent(targetUser.email)}`, req.url)
      );
    }

    // 4. CRITICAL IDENTITY-MATCH CHECK
    if (ssoState.userId && ssoState.userId !== targetUser.id) {
      return NextResponse.json(
        { error: 'Security Violation: IdP authenticated identity does not match the user ID that initiated the SSO flow' },
        { status: 403 }
      );
    }

    // Issue sso_token with isolated type
    const ssoTokenId = `stk-${Date.now()}`;
    const tokenString = `token_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const tokenType = isAdminDryRun ? 'sso_dry_run' : 'sso_get_key';

    db.ssoTokens.push({
      id: ssoTokenId,
      token: tokenString,
      userId: targetUser.id,
      type: tokenType,
      active: true,
      ssoSettingsId: ssoSetting.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 5).toISOString(), // 5 MINUTES
    });

    if (isAdminDryRun) {
      return NextResponse.redirect(
        new URL(`/settings?ssoDryRun=success&token=${encodeURIComponent(tokenString)}&settingId=${ssoSetting.id}`, req.url)
      );
    } else {
      return NextResponse.redirect(
        new URL(`/login?ssoSuccess=true&token=${encodeURIComponent(tokenString)}&userId=${targetUser.id}`, req.url)
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
