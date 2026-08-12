import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, data } = body;

    if (!userId || !data) {
      return NextResponse.json({ error: 'User ID and wrapped secret payload data are required' }, { status: 400 });
    }

    if (data.length > 512) {
      return NextResponse.json({ error: 'Wrapped secret payload exceeds maximum 512 character limit' }, { status: 400 });
    }

    // Replace existing key for user
    db.ssoKeys = db.ssoKeys.filter((k) => k.userId !== userId);

    const newKey = {
      id: `sso-key-${Date.now()}`,
      userId,
      data,
      createdAt: new Date().toISOString(),
    };
    db.ssoKeys.push(newKey);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'SSO_KEY_REGISTERED',
      userId,
      details: `Enrolled device-wrapped SSO key for user ${userId}`,
    });

    return NextResponse.json({ success: true, key: newKey });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'u-1';

    db.ssoKeys = db.ssoKeys.filter((k) => k.userId !== userId);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'SSO_KEY_REVOKED',
      userId,
      details: `Revoked SSO device key registration for user ${userId}`,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
