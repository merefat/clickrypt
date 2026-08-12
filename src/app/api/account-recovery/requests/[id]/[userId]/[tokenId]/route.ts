import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string; tokenId: string }> }
) {
  try {
    const { id, userId, tokenId } = await params;

    const request = db.accountRecoveryRequests.find(
      (r) => r.id === id && r.userId === userId && r.tokenId === tokenId
    );

    // Generic error to prevent enumeration
    if (!request) {
      return NextResponse.json({ error: 'Invalid recovery request or expired token' }, { status: 400 });
    }

    const response = db.accountRecoveryResponses.find(
      (res) => res.accountRecoveryRequestId === request.id && res.status === 'approved'
    );

    return NextResponse.json({
      status: request.status,
      data: response ? response.data : null,
      armoredKey: request.armoredKey,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid recovery request or expired token' }, { status: 400 });
  }
}
