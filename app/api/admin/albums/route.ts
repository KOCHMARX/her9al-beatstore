import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { clean } from '@/lib/distribution';

export const runtime = 'nodejs';

export async function GET() {
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const db = adminDb();
  const { data, error } = await db.from('albums').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('HER9AL ADMIN ALBUMS QUERY ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not load albums.' }, { status: 500 });
  }
  return NextResponse.json({ albums: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-album-write', limit: 120, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const b = await req.json().catch(() => ({}));
  const title = clean(b.title, 120);
  if (!title) return NextResponse.json({ error: 'album title required' }, { status: 400 });
  const db = adminDb();
  const { data, error } = await db.from('albums').insert({
    title,
    cover_url: clean(b.cover_url, 1000) || null,
    published: b.published !== false,
  }).select('*').single();
  if (error || !data) {
    console.error('HER9AL ADMIN ALBUM CREATE ERROR', { code: error?.code });
    return NextResponse.json({ error: 'Could not create album.' }, { status: 500 });
  }
  return NextResponse.json({ album: data });
}

export async function DELETE(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-album-write', limit: 120, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const id = req.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const db = adminDb();
  const { error } = await db.from('albums').delete().eq('id', id);
  if (error) {
    console.error('HER9AL ADMIN ALBUM DELETE ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not delete album.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
