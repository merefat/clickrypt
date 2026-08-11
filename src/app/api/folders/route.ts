import { NextResponse } from 'next/server';
import { db } from '@/lib/backendDb';

export async function GET() {
  return NextResponse.json(db.folders);
}

export async function POST(request: Request) {
  try {
    const { name, description } = await request.json();

    const newFolder = {
      id: `f-${Date.now()}`,
      name,
      description: description || 'Custom folder',
      itemCount: 0,
      lastModified: 'Just now',
    };

    db.folders.push(newFolder);
    return NextResponse.json(newFolder, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
