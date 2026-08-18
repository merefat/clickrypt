import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET() {
  return NextResponse.json(db.users);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const targetId = body.id || body.userId;
    const role = body.role;
    const status = body.status;

    const user = db.users.find((u) => u.id === targetId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.role === 'Owner') {
      return NextResponse.json({ error: 'Organization Owner account cannot be modified.' }, { status: 403 });
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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const targetUser = db.users.find((u) => u.id === userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'Owner') {
      return NextResponse.json({ error: 'Cannot delete the Organization Owner account.' }, { status: 403 });
    }

    const index = db.users.findIndex((u) => u.id === userId);
    if (index !== -1) {
      db.users.splice(index, 1);
    }

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'DELETE_USER',
      userId: 'u-1',
      details: `Permanently deleted member account ${targetUser.email} (${targetUser.role})`,
    });

    return NextResponse.json({ success: true, message: `Deleted user ${targetUser.name}` });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
