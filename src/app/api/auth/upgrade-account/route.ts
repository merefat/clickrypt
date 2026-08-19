import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = db.users.find((u) => u.id === authUser.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.role !== 'External') {
      return NextResponse.json({ error: 'Only External view-only accounts can be upgraded.' }, { status: 400 });
    }

    const body = await request.json();
    const targetRole = body.role || 'User';
    user.role = targetRole;
    user.lastActive = 'Just now';
    persistDb(db);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'ACCOUNT_UPGRADED',
      userId: user.id,
      details: `Account upgraded from External to ${targetRole}`,
    });

    return NextResponse.json({ success: true, user: { ...user } });
  } catch (error) {
    console.error('Upgrade account error:', error);
    return NextResponse.json({ error: 'Failed to upgrade account' }, { status: 500 });
  }
}
