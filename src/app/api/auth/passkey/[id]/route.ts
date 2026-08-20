import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { persistDb } from '@/lib/dbPersistence';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Passkey ID required' }, { status: 400 });
    }

    const mode =
      (request.headers.get('x-app-mode') as 'personal' | 'organization') ||
      'personal';

    const before = user.passkeys || [];
    const after = before.filter((p) => p.id !== id && !(p.id === id && p.mode === mode));

    if (after.length === before.length) {
      return NextResponse.json(
        { error: 'Passkey not found.' },
        { status: 404 }
      );
    }

    user.passkeys = after;
    persistDb(db);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Passkey delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete passkey';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
