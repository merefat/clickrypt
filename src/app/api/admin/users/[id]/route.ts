import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === 'u-1') {
    return NextResponse.json({ error: 'Cannot delete primary Owner account' }, { status: 400 });
  }

  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const deletedUser = db.users.splice(index, 1)[0];

  db.auditLogs.unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'DELETE_USER',
    userId: 'u-1',
    details: `Permanently deleted user account ${deletedUser.email}`,
  });

  return NextResponse.json({ success: true, deletedUser });
}
