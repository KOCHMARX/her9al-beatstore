import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('display_name' in body) patch.display_name = String(body.display_name || '').trim().slice(0, 50);
  if ('avatar_url' in body && body.avatar_url) patch.avatar_url = String(body.avatar_url).trim().slice(0, 1000);

  const db = adminDb();
  const { data, error } = await db.from('app_users').update(patch).eq('id', user.id).select('id,email,display_name,avatar_url,role,provider').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: data });
}
