import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'u-1';

    const setting = db.accountRecoveryUserSettings.find((s) => s.userId === userId);
    return NextResponse.json({
      status: setting ? setting.status : 'rejected',
      hasEscrowedKey: db.accountRecoveryPrivateKeys.some((k) => k.userId === userId),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, status, privateKeyData, passwordData, recipientFingerprint } = body;

    if (!userId || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid user or status' }, { status: 400 });
    }

    // Check policy
    const policy = db.accountRecoveryPolicies.find((p) => !p.deletedAt);
    if (policy?.policy === 'disabled' && status === 'approved') {
      return NextResponse.json({ error: 'Account recovery is currently disabled by organization policy' }, { status: 400 });
    }

    if (policy?.policy === 'mandatory' && status === 'rejected') {
      return NextResponse.json({ error: 'Account recovery is mandatory by organization policy and cannot be opted out' }, { status: 400 });
    }

    // Update user setting
    const existingSettingIdx = db.accountRecoveryUserSettings.findIndex((s) => s.userId === userId);
    if (existingSettingIdx >= 0) {
      db.accountRecoveryUserSettings[existingSettingIdx].status = status;
    } else {
      db.accountRecoveryUserSettings.push({
        id: `arus-${Date.now()}`,
        userId,
        status,
        createdAt: new Date().toISOString(),
      });
    }

    if (status === 'approved' && privateKeyData && passwordData) {
      // Save escrowed private key
      const pkId = `arpk-${Date.now()}`;
      db.accountRecoveryPrivateKeys = db.accountRecoveryPrivateKeys.filter((k) => k.userId !== userId);
      db.accountRecoveryPrivateKeys.push({
        id: pkId,
        userId,
        data: privateKeyData,
        createdAt: new Date().toISOString(),
      });

      // Save password blob
      db.accountRecoveryPrivateKeyPasswords.push({
        id: `apkp-${Date.now()}`,
        privateKeyId: pkId,
        recipientFingerprint: recipientFingerprint || 'ORG_RECOVERY_KEY',
        data: passwordData,
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
