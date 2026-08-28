import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { matchesOrganizationDomain } from '@/lib/config';
import { sendEmail } from '@/lib/email';
import { persistDb } from '@/lib/dbPersistence';

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
    const cleanEmail = (email || '').toLowerCase().trim();

    if (!cleanEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const organization = authUser.organizationId
      ? db.organizations.find((o) => o.id === authUser.organizationId)
      : db.organizations.find((o) => o.domain && authUser.email?.toLowerCase().endsWith('@' + o.domain.toLowerCase()));

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (organization.verificationStatus !== 'verified') {
      return NextResponse.json(
        { error: 'Organization must be verified before inviting members' },
        { status: 400 }
      );
    }

    if (!matchesOrganizationDomain(cleanEmail, organization.domain)) {
      return NextResponse.json(
        { error: 'Invitee email domain must exactly match the organization domain' },
        { status: 400 }
      );
    }

    const existingUser = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existingUser && existingUser.status !== 'Invited') {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    const token = `inv-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

    // Remove any previous pending invite for this email
    const prevInviteIdx = db.invitations.findIndex((i) => i.email.toLowerCase() === cleanEmail);
    if (prevInviteIdx >= 0) {
      db.invitations.splice(prevInviteIdx, 1);
    }

    const newInvite = {
      id: `inv-${Date.now()}`,
      token,
      email: cleanEmail,
      role: (role === 'Admin' ? 'Admin' : 'User') as 'Admin' | 'User',
      invitedBy: authUser.id,
      createdAt: new Date().toISOString(),
      status: 'Pending' as const,
    };

    db.invitations.push(newInvite);

    const nameParts = cleanEmail.split('@')[0].split('.');
    const formattedName = nameParts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

    if (existingUser && existingUser.status === 'Invited') {
      existingUser.role = newInvite.role;
      existingUser.name = formattedName || cleanEmail;
      existingUser.lastActive = 'Pending Onboarding';
    } else {
      db.users.push({
        id: `u-invited-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        email: cleanEmail,
        name: formattedName || cleanEmail,
        role: newInvite.role,
        status: 'Invited' as any,
        publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nmQENBF2...==\n-----END PGP PUBLIC KEY BLOCK-----',
        encryptedPrivateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n\nlQOYBF2...==\n-----END PGP PRIVATE KEY BLOCK-----',
        lastActive: 'Pending Onboarding',
        accountMode: 'organization' as any,
        organizationId: organization.id,
      });
    }

    await persistDb(db);

    db.auditLogsFor('organization').unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'INVITE_MEMBER',
      userId: authUser.id,
      details: `Generated invitation for ${cleanEmail} as ${newInvite.role}`,
    });

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const inviteUrl = `${protocol}://${host}/register?inviteToken=${token}&email=${encodeURIComponent(cleanEmail)}&role=${newInvite.role}&mode=organization`;

    // Send invitation email via SMTP
    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendEmail({
        to: cleanEmail,
        subject: `You're invited to join ${organization.domain} on ClicKrypt`,
        text: `Hello ${formattedName || cleanEmail},\n\n${authUser.name || authUser.email} has invited you to join the ${organization.domain} organization on ClicKrypt as ${newInvite.role}.\n\nClick the link below to accept your invitation and create your secure vault:\n${inviteUrl}\n\nIf you did not expect this invitation, you can ignore this email.`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #0f172a; margin: 0; font-size: 22px;">ClicKrypt Team Invitation</h2>
              <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Zero-Knowledge Enterprise Vault</p>
            </div>
            <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
                Hello <strong>${formattedName || cleanEmail}</strong>,
              </p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                <strong>${authUser.name || authUser.email}</strong> has invited you to join the <strong>${organization.domain}</strong> organization on ClicKrypt with the role of <strong>${newInvite.role}</strong>.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteUrl}" style="background: linear-gradient(135deg, #f39c12 0%, #1fbbd2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                  Accept Invitation & Set Up Vault →
                </a>
              </div>
              <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 0;">
                Or copy and paste this link into your browser:<br/>
                <a href="${inviteUrl}" style="color: #0284c7; word-break: break-all;">${inviteUrl}</a>
              </p>
            </div>
            <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 11px;">
              © ${new Date().getFullYear()} ClicKrypt. All rights reserved.
            </div>
          </div>
        `,
      });
      emailSent = true;
    } catch (mailErr: any) {
      console.error('Failed to send invitation email:', mailErr);
      emailError = mailErr.message || 'Failed to dispatch email';
    }

    return NextResponse.json({
      success: true,
      invite: newInvite,
      inviteUrl,
      inviteLink: inviteUrl,
      emailSent,
      emailError,
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

export async function DELETE(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser || (authUser.role !== 'Owner' && authUser.role !== 'Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email')?.toLowerCase();
    const token = searchParams.get('token');

    if (!email && !token) {
      return NextResponse.json({ error: 'Email or token is required' }, { status: 400 });
    }

    if (token) {
      db.invitations = db.invitations.filter((i) => i.token !== token);
      const { getSupabaseServer } = await import('@/lib/supabaseServer');
      await getSupabaseServer().from('invitations').delete().eq('token', token);
    }
    if (email) {
      db.invitations = db.invitations.filter((i) => i.email.toLowerCase() !== email);
      db.users = db.users.filter((u) => !(u.email.toLowerCase() === email && u.status === 'Invited'));
      const { getSupabaseServer } = await import('@/lib/supabaseServer');
      await getSupabaseServer().from('invitations').delete().eq('email', email);
    }

    await persistDb(db);
    return NextResponse.json({ success: true, message: 'Invitation revoked' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 });
  }
}
