import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET() {
  return NextResponse.json(db.auditLogs);
}
