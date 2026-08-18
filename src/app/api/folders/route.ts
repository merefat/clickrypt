import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secretVaultParam = searchParams.get('secretVault');
    const mode = (req.headers.get('x-app-mode') || 'personal') as 'personal' | 'organization';

    let folders = db.folders.filter((f) => (f.mode || 'personal') === mode);

    if (secretVaultParam === 'true') {
      folders = folders.filter((f) => f.isPrivateOnly === true);
    } else {
      folders = folders.filter((f) => !f.isPrivateOnly);
    }

    const foldersWithCounts = folders.map((f) => ({
      ...f,
      itemCount: db.resources.filter((r) => r.folderId === f.id).length,
    }));

    return NextResponse.json(foldersWithCounts);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, isPrivateOnly } = body;
    const mode = (req.headers.get('x-app-mode') || 'personal') as 'personal' | 'organization';

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
      mode,
    };

    db.folders.unshift(newFolder);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CREATE_FOLDER',
      userId: 'u-1',
      details: `Created ${isPrivateOnly ? 'Private Secret' : 'Workplace'} folder ${name}`,
    });

    return NextResponse.json(newFolder, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
