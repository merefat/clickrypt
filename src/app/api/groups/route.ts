import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json([]);
    }

    const sortByOrder = (a: any, b: any) => {
      const soA = a.sortOrder ?? 0;
      const soB = b.sortOrder ?? 0;
      if (soA !== soB) return soA - soB;
      return a.id.localeCompare(b.id);
    };

    // Organization Owners see all groups; Admins and Users only see groups they are members of
    if (authUser.role === 'Owner') {
      return NextResponse.json([...db.groups].sort(sortByOrder));
    }

    const userGroups = db.groups.filter((g) =>
      g.members.some((m) => m.userId === authUser.id)
    );

    userGroups.sort(sortByOrder);
    return NextResponse.json(userGroups);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authUser.role !== 'Owner' && authUser.role !== 'Admin') {
      return NextResponse.json({ error: 'Only Owners or Admins can create groups' }, { status: 403 });
    }

    const { name, description, memberIds } = await request.json();

    const maxSort = db.groups.reduce((m, it) => Math.max(m, it.sortOrder ?? 0), 0);

    const now = new Date().toISOString();
    const newGroup = {
      id: `g-${Date.now()}`,
      name,
      description: description || 'Team access group',
      members: [
        { userId: authUser.id, role: 'Owner' as const },
        ...(memberIds || [])
          .filter((id: string) => id !== authUser.id)
          .map((userId: string) => ({ userId, role: 'User' as const })),
      ],
      createdAt: now,
      lastActive: now,
      sortOrder: maxSort + 1,
    };

    db.groups.push(newGroup);

    const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CREATE_GROUP',
      userId: authUser.id,
      groupId: newGroup.id,
      details: `Created team group ${name}`,
    });

    return NextResponse.json(newGroup, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}
