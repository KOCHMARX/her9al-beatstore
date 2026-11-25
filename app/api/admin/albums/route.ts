import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

async function staffUser() {
  const user = await currentUser();
  if (!user) return { user: null, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!isStaff(user)) return { user: null, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user, response: null };
}

function coverUrl(value: unknown) {
  const raw = String(value || '').trim().slice(0, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.pathname.includes('/storage/v1/object/public/beat-covers/') ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await staffUser();
  if (auth.response) return auth.response;
  const { data, error } = await adminDb().from('albums').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load albums.' }, { status: 500 });
  return NextResponse.json({ albums: data || [] });
}

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const auth = await staffUser();
  if (auth.response) return auth.response;
  const limited = await rateLimit(req, { action: 'admin-album-create', limit: 60, windowSeconds: 3600, identifier: auth.user!.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: 'Album title is required.' }, { status: 400 });
  const cover = coverUrl(body.cover_url);
  if (body.cover_url && !cover) return NextResponse.json({ error: 'Invalid cover upload.' }, { status: 400 });
  const { data, error } = await adminDb().from('albums').insert({ title, cover_url: cover, published: body.published !== false }).select('*').single();
  if (error) return NextResponse.json({ error: 'Could not create album.' }, { status: 500 });
  return NextResponse.json({ album: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const auth = await staffUser();
  if (auth.response) return auth.response;
  const limited = await rateLimit(req, { action: 'admin-album-delete', limit: 30, windowSeconds: 3600, identifier: auth.user!.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const id = req.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid album.' }, { status: 400 });
  const { data, error } = await adminDb().from('albums').delete().eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not delete album.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Album not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
