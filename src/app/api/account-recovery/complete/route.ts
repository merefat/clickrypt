import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, requestId, tokenId, newPublicKey, newEncryptedPrivateKey } = body;

    if (!userId || !requestId || !tokenId || !newPublicKey || !newEncryptedPrivateKey) {
      return NextResponse.json({ error: 'Missing required completion parameters' }, { status: 400 });
    }

    // STRICT SERVER-SIDE RE-VALIDATION
    const request = db.accountRecoveryRequests.find(
      (r) => r.id === requestId && r.userId === userId && r.tokenId === tokenId
    );

    if (!request) {
      return NextResponse.json({ error: 'Invalid recovery request or expired token' }, { status: 400 });
    }

    if (request.status !== 'approved') {
      return NextResponse.json({ error: 'Recovery request is not approved' }, { status: 400 });
    }

    // Update user keys
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return NextResponse.json({ error: 'Target user account not found' }, { status: 404 });
    }

    user.publicKey = newPublicKey;
    user.encryptedPrivateKey = newEncryptedPrivateKey;
    user.lastActive = 'Just now';

    // Update request state
    request.status = 'completed';
    request.modifiedAt = new Date().toISOString();

    // NULL OUT RESPONSE PAYLOAD DATA FOR MANDATORY HYGIENE
    db.accountRecoveryResponses.forEach((res) => {
      if (res.accountRecoveryRequestId === requestId) {
        res.data = null;
      }
    });

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'RECOVERY_COMPLETED',
      userId,
      details: `User ${user.email} successfully completed account recovery and set new Master Password`,
    });

    return NextResponse.json({ success: true, message: 'Account recovery completed successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
