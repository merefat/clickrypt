import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
    const body = await req.json();
    const { data } = body;

    if (!data) {
      return NextResponse.json({ error: 'Wrapped secret payload data is required' }, { status: 400 });
    }

    if (data.length > 512) {
      return NextResponse.json({ error: 'Wrapped secret payload exceeds maximum 512 character limit' }, { status: 400 });
    }

    // Replace existing key for user
    db.ssoKeys = db.ssoKeys.filter((k) => k.userId !== authUser.id);

    const newKey = {
      id: `sso-key-${Date.now()}`,
      userId: authUser.id,
      data,
      createdAt: new Date().toISOString(),
    };
    db.ssoKeys.push(newKey);

    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'SSO_KEY_REGISTERED',
      userId: authUser.id,
      details: `Enrolled device-wrapped SSO key for user ${authUser.id}`,
    });

    return NextResponse.json({ success: true, key: newKey });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';

    db.ssoKeys = db.ssoKeys.filter((k) => k.userId !== authUser.id);

    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'SSO_KEY_REVOKED',
      userId: authUser.id,
      details: `Revoked SSO device key registration for user ${authUser.id}`,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
