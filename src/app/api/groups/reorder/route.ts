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

    if (authUser.role !== 'Owner' && authUser.role !== 'Admin') {
      return NextResponse.json({ error: 'Only Owners or Admins can reorder groups' }, { status: 403 });
    }

    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const lookup = new Map(db.groups.map((g) => [g.id, g]));
    let changed = false;

    ids.forEach((id: string, index: number) => {
      const group = lookup.get(id);
      if (group) {
        group.sortOrder = (index + 1) * 10;
        changed = true;
      }
    });

    if (changed) {
      persistDb(db);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to reorder groups' }, { status: 500 });
  }
}
