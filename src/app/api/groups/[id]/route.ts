import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = db.groups.find((g) => g.id === id);
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }
  return NextResponse.json(group);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const group = db.groups.find((g) => g.id === id);

  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  if (body.name) group.name = body.name;
  if (body.description) group.description = body.description;

  // Add or update group member
  if (body.addUserId) {
    const existingMember = group.members.find((m) => m.userId === body.addUserId);
    if (existingMember) {
      existingMember.role = body.role || existingMember.role;
    } else {
      group.members.push({ userId: body.addUserId, role: body.role || 'User' });
    }
  }

  // Remove member
  if (body.removeUserId) {
    group.members = group.members.filter((m) => m.userId !== body.removeUserId);
  }

  group.lastActive = 'Just now';

  db.auditLogs.unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'UPDATE_GROUP',
    userId: 'u-1',
    details: `Updated team group ${group.name}`,
  });

  return NextResponse.json(group);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = db.groups.findIndex((g) => g.id === id);

  if (index === -1) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  const deleted = db.groups.splice(index, 1)[0];

  db.auditLogs.unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'DELETE_GROUP',
    userId: 'u-1',
    details: `Deleted team group ${deleted.name}`,
  });

  return NextResponse.json({ success: true });
}
