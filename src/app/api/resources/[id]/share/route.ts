import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sharedSecrets } = await request.json(); // Array of { targetUserId, encryptedData }

  const resource = db.resources.find((r) => r.id === id);
  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  if (resource.isPrivateOnly) {
    return NextResponse.json({ error: 'Private Secret Vault items cannot be shared by design' }, { status: 400 });
  }

  for (const item of sharedSecrets || []) {
    const existing = resource.secrets.find((s) => s.userId === item.targetUserId);
    if (existing) {
      existing.encryptedData = item.encryptedData;
    } else {
      resource.secrets.push({ userId: item.targetUserId, encryptedData: item.encryptedData });
    }
  }

  db.auditLogs.unshift({
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'SHARE_RESOURCE',
    userId: 'u-1',
    resourceId: id,
    details: `Shared password resource ${resource.name} with target users`,
  });

  return NextResponse.json({ success: true, secretsCount: resource.secrets.length });
}
