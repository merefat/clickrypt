import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { VERIFICATION_CODE_EXPIRY_MINUTES } from '@/lib/config';
import { generateVerificationCode, sendVerificationEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = db.users.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: 'No pending organization found for this email' }, { status: 400 });
    }

    const org = db.organizations.find((o) => o.id === user.organizationId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (org.verificationStatus === 'verified') {
      return NextResponse.json({ error: 'Organization is already verified. Please sign in.' }, { status: 400 });
    }

    if (org.ownerId !== user.id) {
      return NextResponse.json({ error: 'Only the owner can request a new verification code' }, { status: 403 });
    }

    const code = generateVerificationCode();
    org.verificationCode = code;
    org.verificationCodeExpiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const mailResult = await sendVerificationEmail(cleanEmail, code, org.domain);
    await persistDb(db);

    if (!mailResult.success) {
      return NextResponse.json(
        {
          error: `Verification code generated, but email delivery failed: ${mailResult.error || 'SMTP delivery error'}. Please verify your email settings.`,
          emailSent: false,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      emailSent: true,
      message: 'A new verification code has been successfully sent to your email.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json({ error: 'Failed to resend verification code' }, { status: 500 });
  }
}
