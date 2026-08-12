import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { targetUserId, targetUserIds, encryptedData, secrets, isExternalShared, externalShareEmail } = body;

    const resource = db.resources.find((r) => r.id === id);
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    if (isExternalShared !== undefined) {
      resource.isExternalShared = isExternalShared;
      if (externalShareEmail) resource.externalShareEmail = externalShareEmail;
    }

    // Handle batch targetUserIds and secrets
    if (secrets && Array.isArray(secrets)) {
      secrets.forEach((s: any) => {
        const existingIdx = resource.secrets.findIndex((sec) => sec.userId === s.userId);
        if (existingIdx >= 0) {
          resource.secrets[existingIdx] = s;
        } else {
          resource.secrets.push(s);
        }
      });
    } else if (targetUserId && encryptedData) {
      const existingIdx = resource.secrets.findIndex((s) => s.userId === targetUserId);
      if (existingIdx >= 0) {
        resource.secrets[existingIdx] = { userId: targetUserId, encryptedData };
      } else {
        resource.secrets.push({ userId: targetUserId, encryptedData });
      }
    }

    db.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'SHARE_RESOURCE',
      userId: 'u-1',
      resourceId: id,
      details: `Shared resource ${resource.name} with ${(targetUserIds || [targetUserId]).length} members via OpenPGP re-encryption`,
    });

    return NextResponse.json({ success: true, resource });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
