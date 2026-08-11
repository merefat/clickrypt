import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET() {
  return NextResponse.json(db.groups);
}

export async function POST(request: Request) {
  try {
    const { name, description, memberIds } = await request.json();

    const newGroup = {
      id: `g-${Date.now()}`,
      name,
      description: description || 'Team access group',
      members: [
        { userId: 'u-1', role: 'Owner' as const },
        ...(memberIds || []).map((userId: string) => ({ userId, role: 'User' as const })),
      ],
      lastActive: 'Just now',
    };

    db.groups.push(newGroup);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CREATE_GROUP',
      userId: 'u-1',
      details: `Created team group ${name}`,
    });

    return NextResponse.json(newGroup, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}
