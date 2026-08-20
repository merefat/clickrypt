import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { VERIFICATION_CODE_EXPIRY_MINUTES } from '@/lib/config';
import { generateVerificationCode, sendVerificationEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const org = db.organizations.find((o) => o.id === user.organizationId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (org.verificationStatus === 'verified') {
      return NextResponse.json({ error: 'Organization is already verified' }, { status: 400 });
    }

    if (org.ownerId !== user.id) {
      return NextResponse.json({ error: 'Only the owner can request a new code' }, { status: 403 });
    }

    const code = generateVerificationCode();
    org.verificationCode = code;
    org.verificationCodeExpiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

    await sendVerificationEmail(email, code);

    return NextResponse.json({
      success: true,
      message: 'A new verification code has been sent',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json({ error: 'Failed to resend code' }, { status: 500 });
  }
}
