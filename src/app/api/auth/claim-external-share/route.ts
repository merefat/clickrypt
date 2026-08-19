import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';

export async function POST(request: Request) {
  try {
    const { email, externalShareId } = await request.json();
    if (!email || !externalShareId) {
      return NextResponse.json({ error: 'Email and share ID are required.' }, { status: 400 });
    }

    const resource = db.resources.find((r) => r.id === externalShareId);
    if (!resource) {
      return NextResponse.json({ error: 'Shared resource not found.' }, { status: 404 });
    }

    if (!resource.isExternalShared || resource.externalShareEmail?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'This share link does not match your email address.' }, { status: 403 });
    }

    if (!resource.sharedWith) resource.sharedWith = [];
    const lowerEmail = email.toLowerCase();
    if (!resource.sharedWith.includes(lowerEmail)) {
      resource.sharedWith.push(lowerEmail);
    }

    persistDb(db);

    return NextResponse.json({ success: true, message: 'External share claimed.' });
  } catch (error) {
    console.error('Claim external share error:', error);
    return NextResponse.json({ error: 'Failed to claim external share.' }, { status: 500 });
  }
}
