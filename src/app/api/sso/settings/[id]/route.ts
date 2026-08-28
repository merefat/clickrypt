import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';
import { getSupabaseServer } from '@/lib/supabaseServer';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
    const { id } = await params;
    const body = await req.json();
    const { action } = body; // 'activate' | 'deactivate'

    const setting = db.ssoSettings.find((s) => s.id === id);
    if (!setting) {
      return NextResponse.json({ error: 'SSO setting not found' }, { status: 404 });
    }

    if (action === 'activate') {
      // SINGLE ACTIVE SSO CONFIG RULE: Demote any existing active setting for this provider to disabled
      db.ssoSettings.forEach((s) => {
        if (s.provider === setting.provider && s.status === 'active') {
          s.status = 'disabled';
          s.modifiedAt = new Date().toISOString();
        }
      });

      setting.status = 'active';
      setting.modifiedAt = new Date().toISOString();

      db.auditLogsFor(userMode).unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'SSO_SETTINGS_ACTIVATED',
        userId: authUser.id,
        details: `Activated SSO provider configuration ${setting.provider} (demoted previous active configs)`,
      });

      await persistDb(db);

      return NextResponse.json({ success: true, setting });
    } else if (action === 'deactivate') {
      setting.status = 'disabled';
      setting.modifiedAt = new Date().toISOString();

      await persistDb(db);

      return NextResponse.json({ success: true, setting });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    db.ssoSettings = db.ssoSettings.filter((s) => s.id !== id);
    await getSupabaseServer().from('sso_settings').delete().eq('id', id);
    await persistDb(db);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
