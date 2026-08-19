import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET() {
  try {
    const settings = db.ssoSettings.map((s) => ({
      id: s.id,
      provider: s.provider,
      status: s.status,
      createdAt: s.createdAt,
      modifiedAt: s.modifiedAt,
    }));
    return NextResponse.json({ settings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
    const body = await req.json();
    const { provider, clientId, clientSecret, tenantId, discoveryUrl } = body;

    if (!provider || !clientId || !clientSecret) {
      return NextResponse.json({ error: 'Provider, Client ID, and Client Secret are required' }, { status: 400 });
    }

    const newSetting = {
      id: `sso-set-${Date.now()}`,
      provider,
      data: JSON.stringify({ clientId, clientSecret, tenantId, discoveryUrl }),
      status: 'draft' as const,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };

    db.ssoSettings.push(newSetting);

    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'SSO_SETTINGS_DRAFT_CREATED',
      userId: authUser.id,
      details: `Created draft SSO configuration for provider ${provider}`,
    });

    return NextResponse.json({ success: true, setting: newSetting });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
