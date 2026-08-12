import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const request = db.accountRecoveryRequests.find((r) => r.id === id);
    if (!request) {
      return NextResponse.json({ error: 'Recovery request not found' }, { status: 404 });
    }

    const user = db.users.find((u) => u.id === request.userId);
    const escrowedPrivateKey = db.accountRecoveryPrivateKeys.find((k) => k.userId === request.userId);
    const escrowedPassword = escrowedPrivateKey
      ? db.accountRecoveryPrivateKeyPasswords.find((p) => p.privateKeyId === escrowedPrivateKey.id)
      : null;

    const responses = db.accountRecoveryResponses.filter((res) => res.accountRecoveryRequestId === request.id);

    return NextResponse.json({
      request: {
        ...request,
        userEmail: user?.email,
        userName: user?.name,
      },
      escrowedPrivateKey: escrowedPrivateKey ? escrowedPrivateKey.data : null,
      escrowedPassword: escrowedPassword ? escrowedPassword.data : null,
      responses,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
