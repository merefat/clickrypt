import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
    }

    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: 'Invalid verification attempt' }, { status: 400 });
    }

    const org = db.organizations.find((o) => o.id === user.organizationId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (org.ownerId !== user.id) {
      return NextResponse.json({ error: 'Only the owner can verify this organization' }, { status: 403 });
    }

    if (org.verificationStatus === 'verified') {
      return NextResponse.json({ error: 'Organization is already verified' }, { status: 400 });
    }

    if (!org.verificationCode || org.verificationCode !== code) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    if (new Date(org.verificationCodeExpiresAt || 0).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Verification code has expired' }, { status: 400 });
    }

    org.verificationStatus = 'verified';
    org.verifiedAt = new Date().toISOString();
    org.verificationCode = null;
    org.verificationCodeExpiresAt = null;

    return NextResponse.json({
      success: true,
      message: 'Organization verified successfully',
    });
  } catch (error) {
    console.error('Verify organization error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
