import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET() {
  return NextResponse.json(db.subscription);
}

export async function POST(request: Request) {
  try {
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

      db.auditLogs.unshift({
        id: `al-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'SUBSCRIPTION_RENEWED',
        userId: 'u-1',
        details: `Organization Subscription renewed via Stripe for 365 days. Vault unlocked for all team members.`,
      });

      return NextResponse.json({ success: true, subscription: db.subscription });
    }

    if (action === 'EXPIRE_DEMO') {
      db.subscription.status = 'Expired';
      db.subscription.daysRemaining = 0;
      return NextResponse.json({ success: true, subscription: db.subscription });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Subscription update failed' }, { status: 500 });
  }
}
