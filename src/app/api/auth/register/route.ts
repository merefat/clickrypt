import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretClickryptJwtKey_2026!';

export async function POST(request: Request) {
  try {
    const { name, email, password, publicKey, encryptedPrivateKey } = await request.json();

    const existingUser = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
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
    };

    db.users.push(newUser);

    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'REGISTER_SUCCESS',
      userId: newUser.id,
      details: `New account registered for ${newUser.email}`,
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        publicKey: newUser.publicKey,
        encryptedPrivateKey: newUser.encryptedPrivateKey,
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
