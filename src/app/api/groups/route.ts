import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json([]);
    }

    // Owner and Admin roles see all groups to manage them
    if (authUser.role === 'Owner' || authUser.role === 'Admin') {
      return NextResponse.json(db.groups);
    }

    // Standard Users ONLY see groups where they are an explicit member
    const userGroups = db.groups.filter((g) =>
      g.members.some((m) => m.userId === authUser.id)
    );

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

    const { name, description, memberIds } = await request.json();

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
      lastActive: 'Just now',
    };

    db.groups.push(newGroup);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CREATE_GROUP',
      userId: authUser.id,
      details: `Created team group ${name}`,
    });

    return NextResponse.json(newGroup, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}
