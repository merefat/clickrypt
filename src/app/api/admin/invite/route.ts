import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { matchesOrganizationDomain } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authUser.role !== 'Owner' && authUser.role !== 'Admin') {
      return NextResponse.json({ error: 'Only Owners or Admins can invite members' }, { status: 403 });
    }

    const { email, role } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const organization = authUser.organizationId
      ? db.organizations.find((o) => o.id === authUser.organizationId)
      : null;

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (organization.verificationStatus !== 'verified') {
      return NextResponse.json(
        { error: 'Organization must be verified before inviting members' },
        { status: 400 }
      );
    }

    if (!matchesOrganizationDomain(email, organization.domain)) {
      return NextResponse.json(
        { error: 'Invitee email domain must exactly match the organization domain' },
        { status: 400 }
      );
    }

    const existingUser = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    const token = `inv-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

    const newInvite = {
      id: `inv-${Date.now()}`,
      token,
      email,
      role: (role === 'Admin' ? 'Admin' : 'User') as 'Admin' | 'User',
      invitedBy: authUser.id,
      createdAt: new Date().toISOString(),
      status: 'Pending' as const,
    };

    db.invitations.push(newInvite);

    const nameParts = email.split('@')[0].split('.');
    const formattedName = nameParts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

    db.users.push({
      id: `u-invited-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      email,
      name: formattedName || email,
      role: newInvite.role,
      status: 'Invited' as any,
      publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...==\n-----END PGP PUBLIC KEY BLOCK-----',
      encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...==\n-----END PGP PRIVATE KEY BLOCK-----',
      lastActive: 'Pending Onboarding',
      accountMode: 'organization' as any,
      organizationId: organization.id,
    });

    db.auditLogsFor('organization').unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'INVITE_MEMBER',
      userId: authUser.id,
      details: `Generated invitation for ${email} as ${newInvite.role}`,
    });

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const inviteUrl = `${protocol}://${host}/register?inviteToken=${token}&email=${encodeURIComponent(email)}&role=${newInvite.role}`;

    return NextResponse.json({
      success: true,
      invite: newInvite,
      inviteUrl,
      inviteLink: inviteUrl,
    });
  } catch (error) {
    console.error('Invite API error:', error);
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
