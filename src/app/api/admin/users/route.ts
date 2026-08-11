import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET() {
  return NextResponse.json(db.users);
}

export async function PUT(request: Request) {
  try {
    const { userId, role, status } = await request.json();
    const user = db.users.find((u) => u.id === userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (role) user.role = role;
    if (status) user.status = status;

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'UPDATE_USER_ROLE',
      userId: 'u-1',
      details: `Updated role/status for user ${user.email}`,
    });

    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
