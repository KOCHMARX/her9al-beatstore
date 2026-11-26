import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { clean, cleanUrl } from '@/lib/distribution';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'profile-update', limit: 60, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('display_name' in body) patch.display_name = clean(body.display_name, 50);
  if ('avatar_url' in body && body.avatar_url) {
    const url = cleanUrl(body.avatar_url);
    if (!url) return NextResponse.json({ error: 'Invalid avatar URL.' }, { status: 400 });
    patch.avatar_url = url;
  }

  const db = adminDb();
  const { data, error } = await db.from('app_users').update(patch).eq('id', user.id).select('id,email,display_name,avatar_url,role,provider').single();
  if (error) return NextResponse.json({ error: 'Could not save profile.' }, { status: 400 });
  return NextResponse.json({ user: data });
}
