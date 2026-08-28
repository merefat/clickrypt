import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and verification code are required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = String(code).trim();

    const user = db.users.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (!user || !user.organizationId) {
      return NextResponse.json({ error: 'No pending organization found for this email' }, { status: 400 });
    }

    const org = db.organizations.find((o) => o.id === user.organizationId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (org.ownerId !== user.id) {
      return NextResponse.json({ error: 'Only the organization owner can verify this organization' }, { status: 403 });
    }

    if (org.verificationStatus === 'verified') {
      return NextResponse.json({ error: 'Organization is already verified. Please sign in.' }, { status: 400 });
    }

    if (!org.verificationCode || org.verificationCode !== cleanCode) {
      return NextResponse.json({ error: 'Invalid verification code. Please check your email or click Resend.' }, { status: 400 });
    }

    if (new Date(org.verificationCodeExpiresAt || 0).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Verification code has expired. Please click Resend Code to receive a new one.' }, { status: 400 });
    }

    org.verificationStatus = 'verified';
    org.verifiedAt = new Date().toISOString();
    org.verificationCode = null;
    org.verificationCodeExpiresAt = null;

    await persistDb(db);

    return NextResponse.json({
      success: true,
      message: 'Organization verified successfully! You can now sign in to your vault.',
    });
  } catch (error) {
    console.error('Verify organization error:', error);
    return NextResponse.json({ error: 'Verification failed due to a server error' }, { status: 500 });
  }
}
