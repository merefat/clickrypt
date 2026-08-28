import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';

export async function POST(request: Request) {
  try {
    const { email, externalShareId } = await request.json();
    if (!email || !externalShareId) {
      return NextResponse.json({ error: 'Email and share ID are required.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const resource =
      db.resources.find((r) => r.id === externalShareId) ||
      db.organizationResources.find((r) => r.id === externalShareId);

    if (!resource) {
      return NextResponse.json({ error: 'Shared resource not found.' }, { status: 404 });
    }

    if (!resource.isExternalShared || resource.externalShareEmail?.toLowerCase() !== cleanEmail) {
      return NextResponse.json({ error: 'This share link does not match your email address.' }, { status: 403 });
    }

    if (!resource.sharedWith) resource.sharedWith = [];
    if (!resource.sharedWith.includes(cleanEmail)) {
      resource.sharedWith.push(cleanEmail);
    }

    const targetUser = db.users.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (targetUser) {
      if (!resource.sharedWith.includes(targetUser.id)) {
        resource.sharedWith.push(targetUser.id);
      }

      // Check if there is an unassociated secret tagged for this email or external
      const emailSecret = (resource.secrets || []).find(
        (s: any) => s.email?.toLowerCase() === cleanEmail || s.userId === 'external' || s.userId?.startsWith('ext-')
      );
      if (emailSecret) {
        emailSecret.userId = targetUser.id;
        emailSecret.email = cleanEmail;
      }
    }

    await persistDb(db);

    return NextResponse.json({ success: true, message: 'External share claimed successfully.' });
  } catch (error) {
    console.error('Claim external share error:', error);
    return NextResponse.json({ error: 'Failed to claim external share.' }, { status: 500 });
  }
}
