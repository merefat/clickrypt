import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { loadDb } from '@/lib/dbPersistence';
import { getAuthUserFromRequest } from '@/lib/authHelper';

// Forces the in-memory backend cache to re-hydrate from Supabase.
//
// The app loads all data into memory once at process startup (see
// src/lib/backendDb.ts) and never re-reads it afterwards. Any change made
// directly in the Supabase dashboard (e.g. clearing tables while debugging)
// will NOT be reflected until either this endpoint is called or the server
// process is fully restarted.
//
// Auth: allowed for a logged-in Owner, OR by presenting DB_RELOAD_SECRET via
// the x-reload-secret header (useful right after wiping data, when no
// account may exist yet to log in with).
export async function POST(request: Request) {
  try {
    const secret = process.env.DB_RELOAD_SECRET;
    const providedSecret = request.headers.get('x-reload-secret');
    const secretOk = !!secret && providedSecret === secret;

    if (!secretOk) {
      const caller = await getAuthUserFromRequest(request);
      if (!caller || caller.role !== 'Owner') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    await loadDb(db);

    return NextResponse.json({
      success: true,
      counts: {
        users: db.users.length,
        organizations: db.organizations.length,
        resources: db.resources.length,
        organizationResources: db.organizationResources.length,
        folders: db.folders.length,
        organizationFolders: db.organizationFolders.length,
        groups: db.groups.length,
      },
    });
  } catch (error) {
    console.error('DB reload error:', error);
    const message = error instanceof Error ? error.message : 'Failed to reload database';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
