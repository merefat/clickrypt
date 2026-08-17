import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET(request: Request) {
  // Subscription check
  if (db.subscription.status === 'Expired' || db.subscription.daysRemaining <= 0) {
    return NextResponse.json(
      { error: 'Organization subscription expired. Payment required to unlock vault.' },
      { status: 402 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase() || '';
  const folderId = searchParams.get('folderId');
  const secretVaultStr = searchParams.get('secretVault');
  const sharedWithUserId = searchParams.get('sharedWithUserId');

  let result = db.resources;

  if (secretVaultStr === 'true') {
    result = result.filter((r) => r.isPrivateOnly === true);
  } else if (secretVaultStr === 'false') {
    result = result.filter((r) => !r.isPrivateOnly);
  }

  if (folderId) {
    result = result.filter((r) => r.folderId === folderId);
  }

  if (sharedWithUserId) {
    result = result.filter((r) => {
      const isOwner = r.ownerId === sharedWithUserId;
      const isSharedOut = isOwner && ((r.secrets && r.secrets.length > 1) || r.isExternalShared);
      const isRecipient = r.secrets && r.secrets.some((s) => s.userId === sharedWithUserId);
      const isExplicitlyShared = r.sharedWith && r.sharedWith.includes(sharedWithUserId);
      return isSharedOut || isRecipient || isExplicitlyShared;
    });
  }

  if (search) {
    result = result.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.username.toLowerCase().includes(search) ||
        r.url.toLowerCase().includes(search) ||
        r.category.toLowerCase().includes(search)
    );
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (db.subscription.status === 'Expired' || db.subscription.daysRemaining <= 0) {
    return NextResponse.json(
      { error: 'Organization subscription expired. Payment required to unlock vault.' },
      { status: 402 }
    );
  }

  try {
    const body = await request.json();
    const newResource = {
      id: `r-${Date.now()}`,
      name: body.name,
      username: body.username || '',
      url: body.url || '',
      category: body.category || 'General',
      ownerId: 'u-1',
      folderId: body.folderId || null,
      isPrivateOnly: !!body.isPrivateOnly,
      strength: body.strength || 'Strong',
      lastModified: 'Just now',
      secrets: [
        {
          userId: 'u-1',
          encryptedData: body.encryptedData || `[PGP-ENCRYPTED-BLOB::${Buffer.from(body.password || 'AcmePass123!').toString('base64')}]`,
        },
      ],
    };

    db.resources.unshift(newResource);

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'CREATE_RESOURCE',
      userId: 'u-1',
      resourceId: newResource.id,
      details: `Created new password item: ${newResource.name}`,
    });

    return NextResponse.json(newResource);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 });
  }
}
