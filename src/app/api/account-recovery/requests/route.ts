import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getArmoredPublicKeyFingerprint } from '@/lib/crypto';

export async function GET() {
  try {
    // Admin list view of recovery requests
    const requests = db.accountRecoveryRequests.map((req) => {
      const user = db.users.find((u) => u.id === req.userId);
      const responses = db.accountRecoveryResponses.filter((res) => res.accountRecoveryRequestId === req.id);
      return {
        ...req,
        userEmail: user?.email || 'unknown',
        userName: user?.name || 'User',
        responses,
      };
    });

    return NextResponse.json({ requests });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, armoredKey } = body;

    const user = db.users.find((u) => u.email.toLowerCase() === email?.toLowerCase());
    if (!user) {
      // Generic non-enumerating success response to prevent email guessing
      return NextResponse.json({ success: true, message: 'If your account exists and is enrolled, a recovery email has been sent.' });
    }

    // Check policy
    const policy = db.accountRecoveryPolicies.find((p) => !p.deletedAt);
    if (policy?.policy === 'disabled') {
      return NextResponse.json({ error: 'Account recovery is disabled for this organization.' }, { status: 400 });
    }

    // Check user enrollment
    const setting = db.accountRecoveryUserSettings.find((s) => s.userId === user.id);
    if (setting?.status === 'rejected') {
      return NextResponse.json({ error: 'This user account is not enrolled in Account Recovery.' }, { status: 400 });
    }

    // Validate OpenPGP public key
    const fingerprint = await getArmoredPublicKeyFingerprint(armoredKey);
    if (!fingerprint) {
      return NextResponse.json({ error: 'Invalid temporary OpenPGP public key provided.' }, { status: 400 });
    }

    // Deactivate previous active requests & tokens for this user
    db.accountRecoveryRequests.forEach((r) => {
      if (r.userId === user.id && r.status === 'pending') {
        r.status = 'rejected';
      }
    });

    const tokenId = `rec-token-${Date.now()}`;
    const requestId = `rec-req-${Date.now()}`;

    const newRequest = {
      id: requestId,
      userId: user.id,
      armoredKey,
      fingerprint,
      tokenId,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };
    db.accountRecoveryRequests.push(newRequest);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'RECOVERY_REQUEST_CREATED',
      userId: user.id,
      details: `Account recovery request initiated for ${user.email}`,
    });

    return NextResponse.json({
      success: true,
      requestId,
      tokenId,
      userId: user.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
