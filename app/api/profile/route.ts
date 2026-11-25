import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ user: {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    role: user.role,
    provider: user.provider,
  } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'profile-update', limit: 30, windowSeconds: 600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('display_name' in body) patch.display_name = String(body.display_name || '').trim().slice(0, 50);

  const db = adminDb();
  const { data, error } = await db.from('app_users').update(patch).eq('id', user.id).select('id,email,display_name,avatar_url,role,provider').single();
  if (error) {
    console.error('HER9AL PROFILE UPDATE ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not update profile.' }, { status: 400 });
  }
  return NextResponse.json({ user: data });
}
