import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    const { searchParams } = new URL(req.url);
    const secretVaultParam = searchParams.get('secretVault');

    const store = db.foldersFor(userMode);
    let folders = store;

    if (secretVaultParam === 'true') {
      folders = folders.filter((f) => f.isPrivateOnly === true);
    } else {
      folders = folders.filter((f) => !f.isPrivateOnly);
    }

    const resourcesStore = db.resourcesFor(userMode);
    const foldersWithCounts = folders.map((f) => ({
      ...f,
      itemCount: resourcesStore.filter((r) => r.folderId === f.id).length,
    }));

    return NextResponse.json(foldersWithCounts);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'personal') as 'personal' | 'organization';
    const body = await req.json();
    const { name, description, isPrivateOnly } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const newFolder = {
      id: `f-${Date.now()}`,
      name,
      description: description || '',
      itemCount: 0,
      lastModified: 'Just now',
      isPrivateOnly: !!isPrivateOnly,
      mode: userMode,
    };

    db.foldersFor(userMode).unshift(newFolder);

    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CREATE_FOLDER',
      userId: authUser.id,
      details: `Created ${isPrivateOnly ? 'Private Secret' : 'Workplace'} folder ${name}`,
    });

    return NextResponse.json(newFolder, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
