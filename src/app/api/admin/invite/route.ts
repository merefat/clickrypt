import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function POST(request: Request) {
  try {
    const { email, role } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const token = `inv-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

    const newInvite = {
      id: `inv-${Date.now()}`,
      token,
      email,
      role: (role === 'Admin' ? 'Admin' : 'User') as 'Admin' | 'User',
      invitedBy: 'u-1', // Owner
      createdAt: new Date().toISOString(),
      status: 'Pending' as const,
    };

    db.invitations.push(newInvite);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'INVITE_MEMBER',
      userId: 'u-1',
      details: `Generated invitation for ${email} as ${newInvite.role}`,
    });

    return NextResponse.json({
      success: true,
      invite: newInvite,
      inviteUrl: `http://localhost:3000/register?inviteToken=${token}&email=${encodeURIComponent(email)}&role=${newInvite.role}`,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  const invite = db.invitations.find((i) => i.token === token);
  if (!invite) {
    return NextResponse.json({ error: 'Invalid or expired invite token' }, { status: 404 });
  }

  return NextResponse.json(invite);
}
