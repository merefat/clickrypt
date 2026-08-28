import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { persistDb } from '@/lib/dbPersistence';

export async function GET(request: Request) {
  const authUser = await getAuthUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json([], { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');

  const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
  let logs = db.auditLogsFor(userMode);

  if (groupId) {
    logs = logs.filter((log) => log.groupId === groupId);
  }

  return NextResponse.json(logs);
}

export async function DELETE(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authUser.role !== 'Owner' && authUser.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden: Only Owners or Admins can delete audit logs' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { ids, deleteAll } = body;
    const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';

    if (deleteAll) {
      const currentLogs = db.auditLogsFor(userMode);
      const deletedCount = currentLogs.length;

      if (userMode === 'organization') {
        db.organizationAuditLogs = [];
      } else {
        db.auditLogs = [];
      }

      await getSupabaseServer().from('audit_logs').delete().eq('mode', userMode);
      await persistDb(db);

      return NextResponse.json({
        success: true,
        count: deletedCount,
        message: `All ${deletedCount} audit log(s) deleted successfully`,
      });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No audit log IDs provided for deletion' }, { status: 400 });
    }

    const idSet = new Set(ids);
    if (userMode === 'organization') {
      db.organizationAuditLogs = db.organizationAuditLogs.filter((log) => !idSet.has(log.id));
    } else {
      db.auditLogs = db.auditLogs.filter((log) => !idSet.has(log.id));
    }

    await getSupabaseServer().from('audit_logs').delete().in('id', ids);
    await persistDb(db);

    return NextResponse.json({
      success: true,
      count: ids.length,
      message: `Successfully deleted ${ids.length} audit log(s)`,
    });
  } catch (error: any) {
    console.error('Failed to delete audit logs:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete audit logs' }, { status: 500 });
  }
}
