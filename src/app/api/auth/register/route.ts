import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import {
  isAllowedOrgEmailDomain,
  matchesOrganizationDomain,
  normalizeOrganizationDomain,
  VERIFICATION_CODE_EXPIRY_MINUTES,
} from '@/lib/config';
import { generateVerificationCode, sendVerificationEmail } from '@/lib/email';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

function verificationCodeExpiry(): string {
  return new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
}

export async function POST(request: Request) {
  try {
    const { name, email, password, role, publicKey, encryptedPrivateKey, accountMode, organizationDomain } =
      await request.json();
    const validatedAccountMode = (accountMode === 'organization' ? 'organization' : 'personal') as
      | 'personal'
      | 'organization';

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const existingUser = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    // Invited member completing registration
    if (existingUser && existingUser.status === 'Invited') {
      existingUser.name = name || existingUser.name || email.split('@')[0];
      existingUser.status = 'Active';
      if (role) existingUser.role = role as any;
      if (publicKey) existingUser.publicKey = publicKey;
      if (encryptedPrivateKey) existingUser.encryptedPrivateKey = encryptedPrivateKey;
      existingUser.lastActive = 'Just now';
      existingUser.accountMode = 'organization' as any;

      const token = jwt.sign(
        { userId: existingUser.id, email: existingUser.email, role: existingUser.role },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      db.auditLogsFor((existingUser.accountMode || 'personal') as 'personal' | 'organization').unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'REGISTER_SUCCESS',
        userId: existingUser.id,
        details: `Invited member completed registration for ${existingUser.email}`,
      });

      const response = NextResponse.json({
        success: true,
        token,
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

      response.cookies.set('access_token', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    if (existingUser && existingUser.status !== 'Invited') {
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

      if (!matchesOrganizationDomain(email, normalizedDomain)) {
        return NextResponse.json(
          { error: 'Your email domain must exactly match the organization domain.' },
          { status: 400 }
        );
      }

      const existingOrg = db.organizations.find((o) => o.domain === normalizedDomain);

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

        const newUser = {
          id: `u-${Date.now()}`,
          email,
          name: name || email.split('@')[0],
          role: 'User' as const,
          status: 'Active' as const,
          publicKey: publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
          encryptedPrivateKey: encryptedPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
          lastActive: 'Just now',
          accountMode: 'organization' as const,
          organizationId: existingOrg.id,
        };

        db.users.push(newUser);
        targetUser = newUser;
      } else {
        // New organization, first registrant becomes pending Owner
        const newOrgId = `org-${crypto.randomUUID()}`;
        const newUser = {
          id: `u-${Date.now()}`,
          email,
          name: name || email.split('@')[0],
          role: 'Owner' as const,
          status: 'Active' as const,
          publicKey: publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
          encryptedPrivateKey: encryptedPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
          lastActive: 'Just now',
          accountMode: 'organization' as const,
          organizationId: newOrgId,
        };

        const code = generateVerificationCode();

        const newOrg = {
          id: newOrgId,
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

        await sendVerificationEmail(email, code);

        return NextResponse.json({
          success: true,
          requiresVerification: true,
          email: newUser.email,
          organizationId: newOrg.id,
        });
      }
    } else {
      // Personal account
      const newUser = {
        id: `u-${Date.now()}`,
        email,
        name: name || email.split('@')[0],
        role: (role === 'External' ? 'External' : role || 'User') as any,
        status: 'Active' as const,
        publicKey: publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
        encryptedPrivateKey: encryptedPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
        lastActive: 'Just now',
        accountMode: 'personal' as const,
      };

      db.users.push(newUser);
      targetUser = newUser;
    }

    const token = jwt.sign(
      { userId: targetUser.id, email: targetUser.email, role: targetUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    db.auditLogsFor((targetUser.accountMode || 'personal') as 'personal' | 'organization').unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'REGISTER_SUCCESS',
      userId: targetUser.id,
      details: `Account registered & activated for ${targetUser.email}`,
    });

    const response = NextResponse.json({
      success: true,
      token,
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

    response.cookies.set('access_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Register API error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
