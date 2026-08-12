import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getArmoredPublicKeyFingerprint } from '@/lib/crypto';

export async function GET() {
  try {
    const currentPolicy = db.accountRecoveryPolicies.find((p) => !p.deletedAt) || {
      id: 'arp-1',
      policy: 'opt-in',
      publicKeyId: null,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };

    let orgPublicKey = null;
    if (currentPolicy.publicKeyId) {
      orgPublicKey = db.accountRecoveryOrgPublicKeys.find((k) => k.id === currentPolicy.publicKeyId);
    }

    return NextResponse.json({
      policy: currentPolicy.policy,
      orgPublicKey: orgPublicKey ? { id: orgPublicKey.id, fingerprint: orgPublicKey.fingerprint } : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { policy, armoredKey } = body;

    if (!['disabled', 'opt-in', 'opt-out', 'mandatory'].includes(policy)) {
      return NextResponse.json({ error: 'Invalid policy type' }, { status: 400 });
    }

    let publicKeyId = null;
    if (policy !== 'disabled') {
      if (!armoredKey) {
        return NextResponse.json({ error: 'Organization Recovery Public Key is required when policy is enabled' }, { status: 400 });
      }

      const fingerprint = await getArmoredPublicKeyFingerprint(armoredKey);
      if (!fingerprint) {
        return NextResponse.json({ error: 'Invalid OpenPGP public key provided' }, { status: 400 });
      }

      const newKeyId = `orpk-${Date.now()}`;
      const orgKeyRecord = {
        id: newKeyId,
        armoredKey,
        fingerprint,
        createdAt: new Date().toISOString(),
      };
      db.accountRecoveryOrgPublicKeys.push(orgKeyRecord);
      publicKeyId = newKeyId;
    }

    // Soft delete existing policy
    db.accountRecoveryPolicies.forEach((p) => {
      if (!p.deletedAt) p.deletedAt = new Date().toISOString();
    });

    const newPolicy = {
      id: `arp-${Date.now()}`,
      policy: policy as any,
      publicKeyId,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };
    db.accountRecoveryPolicies.push(newPolicy);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'UPDATE_RECOVERY_POLICY',
      userId: 'u-1',
      details: `Account Recovery Organization Policy updated to ${policy}`,
    });

    return NextResponse.json({ success: true, policy: newPolicy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
