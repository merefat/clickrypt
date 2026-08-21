import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET(request: Request) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json([], { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');

  const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
  let logs = db.auditLogsFor(userMode);

  if (groupId) {
    logs = logs.filter((log) => log.groupId === groupId);
  }

  return NextResponse.json(logs);
}
