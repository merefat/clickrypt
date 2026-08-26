/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { getSupabaseAuthClient } from '@/lib/supabaseServer';
import {
  isAllowedOrgEmailDomain,
  matchesOrganizationDomain,
  normalizeOrganizationDomain,
  VERIFICATION_CODE_EXPIRY_MINUTES,
} from '@/lib/config';
import { generateVerificationCode, sendVerificationEmail } from '@/lib/email';
import crypto from 'crypto';

function newUserId(): string {
  return `u-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function newOrgId(): string {
  return `org-${crypto.randomUUID()}`;
}

function newItemId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function verificationCodeExpiry(): string {
  return new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
}

async function createOrRecoverAuthUser(
  email: string,
  password: string,
  displayName: string
): Promise<{
  authUser: { id: string };
  session: { access_token: string } | null;
  error?: string;
}> {
  const supabaseAuth = getSupabaseAuthClient();

  const { data: signUpData, error: signUpError } = await supabaseAuth.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: displayName },
  });

  if (signUpData?.user) {
    return { authUser: signUpData.user, session: null };
  }

  if (!signUpError) {
    return { authUser: { id: '' }, session: null, error: 'User creation failed: Supabase did not return a user profile.' };
  }

  const isDuplicate =
    signUpError.message.toLowerCase().includes('already registered') ||
    signUpError.message.toLowerCase().includes('already exists') ||
    signUpError.message.toLowerCase().includes('duplicate');

  if (!isDuplicate) {
    return { authUser: { id: '' }, session: null, error: signUpError.message };
  }

  const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData?.user) {
    return {
      authUser: { id: '' },
      session: null,
      error: 'An account with this email already exists. Please sign in instead.',
    };
  }

  return { authUser: signInData.user, session: signInData.session };
}

export async function POST(request: Request) {
  try {
    const {
      name,
      email,
      password,
      role,
      publicKey,
      encryptedPrivateKey,
      accountMode,
      organizationDomain,
    } = await request.json();

    const lowerEmail = (email || '').toLowerCase().trim();

    if (!lowerEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const validatedAccountMode = (accountMode === 'organization' ? 'organization' : 'personal') as
      | 'personal'
      | 'organization';

    // Account-mode validation
    if (validatedAccountMode === 'personal' && isAllowedOrgEmailDomain(lowerEmail)) {
      return NextResponse.json(
        { error: 'Personal accounts require a consumer email address. Use a personal email or choose Organization.' },
        { status: 400 }
      );
    }

    // Invited member completing registration
    const existingUserIndex = db.users.findIndex((u) => u.email?.toLowerCase() === lowerEmail);
    const existingUser = existingUserIndex >= 0 ? db.users[existingUserIndex] : null;

    let activeSession: { access_token: string } | null = null;

    if (existingUser && existingUser.status === 'Invited') {
      const displayName = name || existingUser.name || lowerEmail.split('@')[0];
      const { authUser, session: authSession, error: authError } = await createOrRecoverAuthUser(
        lowerEmail,
        password,
        displayName
      );
      if (authError) {
        return NextResponse.json({ error: authError }, { status: 409 });
      }
      if (!authUser?.id) {
        return NextResponse.json(
          { error: 'User creation failed: Supabase did not return a user profile.' },
          { status: 500 }
        );
      }

      const authId = authUser.id;

      existingUser.name = name || existingUser.name || lowerEmail.split('@')[0];
      existingUser.status = 'Active';
      existingUser.authId = authId;
      if (role) existingUser.role = role as any;
      if (publicKey) existingUser.publicKey = publicKey;
      if (encryptedPrivateKey) existingUser.encryptedPrivateKey = encryptedPrivateKey;
      existingUser.lastActive = 'Just now';
      existingUser.accountMode = 'organization' as any;

      const session =
        authSession ??
        (await getSupabaseAuthClient().auth.signInWithPassword({
          email: lowerEmail,
          password,
        })).data?.session;
      if (!session) {
        return NextResponse.json(
          { error: 'Account created but session could not be started.' },
          { status: 500 }
        );
      }

      db.auditLogsFor((existingUser.accountMode || 'personal') as 'personal' | 'organization').unshift({
        id: newItemId('al'),
        timestamp: new Date().toISOString(),
        action: 'REGISTER_SUCCESS',
        userId: existingUser.id,
        details: `Invited member completed registration for ${existingUser.email}`,
      });

      await persistDb(db);

      const response = NextResponse.json({
        success: true,
        token: session.access_token,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          role: existingUser.role,
          accountMode: existingUser.accountMode,
          publicKey: existingUser.publicKey,
          encryptedPrivateKey: existingUser.encryptedPrivateKey,
          organizationId: existingUser.organizationId,
        },
      });

      response.cookies.set('access_token', session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      );
    }

    let targetUser: any;

    if (validatedAccountMode === 'organization') {
      if (!organizationDomain) {
        return NextResponse.json(
          { error: 'Organization domain is required for organization accounts.' },
          { status: 400 }
        );
      }

      const normalizedDomain = normalizeOrganizationDomain(organizationDomain);
      if (!normalizedDomain) {
        return NextResponse.json({ error: 'Invalid organization domain.' }, { status: 400 });
      }

      if (!matchesOrganizationDomain(lowerEmail, normalizedDomain)) {
        return NextResponse.json(
          { error: 'Your email domain must exactly match the organization domain.' },
          { status: 400 }
        );
      }

      const existingOrg = db.organizations.find((o) => o.domain === normalizedDomain);
      const displayName = name || lowerEmail.split('@')[0];

      if (existingOrg) {
        if (existingOrg.verificationStatus !== 'verified') {
          return NextResponse.json(
            { error: 'This organization is pending verification. Please wait for an invitation.' },
            { status: 400 }
          );
        }
        if (!existingOrg.openEnrollment) {
          return NextResponse.json(
            { error: 'This organization is invite-only. Please ask for an invite.' },
            { status: 403 }
          );
        }

        const { authUser, session: authSession, error: authError } = await createOrRecoverAuthUser(
          lowerEmail,
          password,
          displayName
        );
        if (authError) {
          return NextResponse.json({ error: authError }, { status: 409 });
        }
        if (!authUser?.id) {
          return NextResponse.json(
            { error: 'User creation failed: Supabase did not return a user profile.' },
            { status: 500 }
          );
        }

        const newUser = {
          id: newUserId(),
          email: lowerEmail,
          name: name || lowerEmail.split('@')[0],
          role: 'User' as const,
          status: 'Active' as const,
          publicKey: publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
          encryptedPrivateKey: encryptedPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
          lastActive: 'Just now',
          accountMode: 'organization' as const,
          organizationId: existingOrg.id,
          authId: authUser.id,
        };

        db.users.push(newUser);
        targetUser = newUser;
        activeSession = authSession;
      } else {
        // New organization, first registrant becomes pending Owner
        const orgId = newOrgId();

        const { authUser, session: authSession, error: authError } = await createOrRecoverAuthUser(
          lowerEmail,
          password,
          displayName
        );
        if (authError) {
          return NextResponse.json({ error: authError }, { status: 409 });
        }
        if (!authUser?.id) {
          return NextResponse.json(
            { error: 'User creation failed: Supabase did not return a user profile.' },
            { status: 500 }
          );
        }

        const newUser = {
          id: newUserId(),
          email: lowerEmail,
          name: name || lowerEmail.split('@')[0],
          role: 'Owner' as const,
          status: 'Active' as const,
          publicKey: publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
          encryptedPrivateKey: encryptedPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
          lastActive: 'Just now',
          accountMode: 'organization' as const,
          organizationId: orgId,
          authId: authUser.id,
        };

        const code = generateVerificationCode();

        const newOrg = {
          id: orgId,
          domain: normalizedDomain,
          ownerId: newUser.id,
          createdAt: new Date().toISOString(),
          verificationStatus: 'pending' as const,
          verificationCode: code,
          verificationCodeExpiresAt: verificationCodeExpiry(),
          openEnrollment: false,
        };

        db.organizations.push(newOrg);
        db.users.push(newUser);

        await sendVerificationEmail(lowerEmail, code);
        await persistDb(db);

        return NextResponse.json({
          success: true,
          requiresVerification: true,
          email: newUser.email,
          organizationId: newOrg.id,
        });
      }
    } else {
      // Personal account
      const displayName = name || lowerEmail.split('@')[0];
      const { authUser, session: authSession, error: authError } = await createOrRecoverAuthUser(
        lowerEmail,
        password,
        displayName
      );
      if (authError) {
        return NextResponse.json({ error: authError }, { status: 409 });
      }
      if (!authUser?.id) {
        return NextResponse.json(
          { error: 'User creation failed: Supabase did not return a user profile.' },
          { status: 500 }
        );
      }

      const newUser = {
        id: newUserId(),
        email: lowerEmail,
        name: name || lowerEmail.split('@')[0],
        role: (role === 'External' ? 'External' : role || 'User') as any,
        status: 'Active' as const,
        publicKey: publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
        encryptedPrivateKey: encryptedPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
        lastActive: 'Just now',
        accountMode: 'personal' as const,
        authId: authUser.id,
      };

      db.users.push(newUser);
      targetUser = newUser;
      activeSession = authSession;
    }

    const session =
      activeSession ??
      (await getSupabaseAuthClient().auth.signInWithPassword({
        email: lowerEmail,
        password,
      })).data?.session;
    if (!session) {
      return NextResponse.json(
        { error: 'Account created but session could not be started.' },
        { status: 500 }
      );
    }

    db.auditLogsFor((targetUser.accountMode || 'personal') as 'personal' | 'organization').unshift({
      id: newItemId('al'),
      timestamp: new Date().toISOString(),
      action: 'REGISTER_SUCCESS',
      userId: targetUser.id,
      details: `Account registered & activated for ${targetUser.email}`,
    });

    await persistDb(db);

    const response = NextResponse.json({
      success: true,
      token: session.access_token,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
        accountMode: targetUser.accountMode,
        publicKey: targetUser.publicKey,
        encryptedPrivateKey: targetUser.encryptedPrivateKey,
        organizationId: targetUser.organizationId,
      },
    });

    response.cookies.set('access_token', session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Register API error:', error);
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
