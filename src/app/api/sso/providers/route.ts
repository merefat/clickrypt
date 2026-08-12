import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET() {
  try {
    const activeSettings = db.ssoSettings.filter((s) => s.status === 'active');
    const enabledProviders = activeSettings.map((s) => s.provider);

    return NextResponse.json({
      providers: [
        { id: 'google', name: 'Google Workspace', enabled: enabledProviders.includes('google') },
        { id: 'azure', name: 'Microsoft Azure AD', enabled: enabledProviders.includes('azure') },
        { id: 'oauth2', name: 'Corporate OAuth2 / OIDC', enabled: enabledProviders.includes('oauth2') },
      ],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
