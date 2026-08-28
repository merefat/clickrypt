import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';
import { getAuthUserFromRequest } from '@/lib/authHelper';
import { persistDb } from '@/lib/dbPersistence';

export async function GET() {
  return NextResponse.json(db.subscription);
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userMode = (authUser.accountMode || 'organization') as 'personal' | 'organization';
    const { action, seats } = await request.json();

    if (action === 'RENEW' || action === 'PAY') {
      db.subscription.status = 'Active';
      db.subscription.daysRemaining = 365;
      db.subscription.seats = seats || db.subscription.seats;
      db.subscription.renewalDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      db.auditLogsFor(userMode).unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'SUBSCRIPTION_RENEWED',
        userId: authUser.id,
        details: `Organization Subscription renewed via Stripe for 365 days. Vault unlocked for all team members.`,
      });

      await persistDb(db);
      return NextResponse.json({ success: true, subscription: db.subscription });
    }

    if (action === 'EXPIRE_DEMO') {
      db.subscription.status = 'Expired';
      db.subscription.daysRemaining = 0;
      await persistDb(db);
      return NextResponse.json({ success: true, subscription: db.subscription });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Subscription update failed' }, { status: 500 });
  }
}
