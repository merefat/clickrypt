import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';

export async function PUT(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const store = db.resourcesFor(userMode);
    const lookup = new Map(store.map((r) => [r.id, r]));
    let changed = false;

    ids.forEach((id: string, index: number) => {
      const resource = lookup.get(id);
      if (resource) {
        resource.sortOrder = (index + 1) * 10;
        changed = true;
      }
    });

    if (changed) {
      persistDb(db);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to reorder resources' }, { status: 500 });
  }
}
