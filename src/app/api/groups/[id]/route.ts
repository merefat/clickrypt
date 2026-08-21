import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const group = db.groups.find((g) => g.id === id);
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }
  if (authUser.role !== 'Owner' && !group.members.some((m) => m.userId === authUser.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(group);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authUser.role !== 'Owner' && authUser.role !== 'Admin') {
    return NextResponse.json({ error: 'Only Owners or Admins can update groups' }, { status: 403 });
  }
  const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
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

  if (!group.assignedFolderIds) group.assignedFolderIds = [];

  // Assign folder to group
  if (body.addFolderId && !group.assignedFolderIds.includes(body.addFolderId)) {
    group.assignedFolderIds.push(body.addFolderId);
  }

  // Remove assigned folder from group
  if (body.removeFolderId) {
    group.assignedFolderIds = group.assignedFolderIds.filter((fid) => fid !== body.removeFolderId);
  }

  group.lastActive = new Date().toISOString();

  db.auditLogsFor(userMode).unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'UPDATE_GROUP',
    userId: authUser.id,
    groupId: group.id,
    details: `Updated team group ${group.name}`,
  });

  return NextResponse.json(group);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authUser.role !== 'Owner' && authUser.role !== 'Admin') {
    return NextResponse.json({ error: 'Only Owners or Admins can delete groups' }, { status: 403 });
  }
  const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
  const { id } = await params;
  const index = db.groups.findIndex((g) => g.id === id);

  if (index === -1) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  const deleted = db.groups.splice(index, 1)[0];

  db.auditLogsFor(userMode).unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'DELETE_GROUP',
    userId: authUser.id,
    groupId: id,
    details: `Deleted team group ${deleted.name}`,
  });

  return NextResponse.json({ success: true });
}
