import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export async function POST(request: Request) {
  try {
    const { name, email, password, publicKey, encryptedPrivateKey } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const existingUser = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    let targetUser: any;

    if (existingUser) {
      if (existingUser.status === 'Active') {
        return NextResponse.json({ error: 'User already exists and is active. Please login.' }, { status: 400 });
      }

      // User exists as 'Invited' or 'Suspended' or 'Pending' -> Activate profile!
      existingUser.name = name || existingUser.name || email.split('@')[0];
      existingUser.status = 'Active';
      if (publicKey) existingUser.publicKey = publicKey;
      if (encryptedPrivateKey) existingUser.encryptedPrivateKey = encryptedPrivateKey;
      existingUser.lastActive = 'Just now';

      targetUser = existingUser;
    } else {
      // Create brand new user
      const newUser = {
        id: `u-${Date.now()}`,
        email,
        name: name || email.split('@')[0],
        role: 'User' as const,
        status: 'Active' as const,
        publicKey: publicKey || '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
        encryptedPrivateKey: encryptedPrivateKey || '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: Clickrypt 1.0\n...',
        lastActive: 'Just now',
      };

      db.users.push(newUser);
      targetUser = newUser;
    }

    const token = jwt.sign(
      { userId: targetUser.id, email: targetUser.email, role: targetUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    db.auditLogs.unshift({
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
        publicKey: targetUser.publicKey,
        encryptedPrivateKey: targetUser.encryptedPrivateKey,
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
