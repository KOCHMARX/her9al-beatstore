import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { clean, cleanUrl } from '@/lib/distribution';

export const runtime = 'nodejs';

export async function GET() {
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const db = adminDb();
  const { data, error } = await db.from('beats').select('*,licenses(*),albums(id,title,cover_url)').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ beats: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-beat-write', limit: 120, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const b = await req.json().catch(() => ({}));
  const title = clean(b.title, 160);
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const slug = `${clean(b.slug || title, 160).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-5)}`;
  const price = Math.max(0, Math.min(100_000_000, Math.round(Number(b.price || 0) * 100)));
  const db = adminDb();
  const { data: beat, error } = await db.from('beats').insert({
    title,
    slug,
    bpm: Number.isFinite(Number(b.bpm)) ? Math.max(1, Math.min(400, Math.round(Number(b.bpm)))) : null,
    musical_key: clean(b.musical_key, 20),
    mood: clean(b.mood, 60),
    genre: clean(b.genre, 60),
    style: clean(b.style, 60),
    description: clean(b.description, 1000) || null,
    cover_url: cleanUrl(b.cover_url) || null,
    preview_url: cleanUrl(b.preview_url) || null,
    master_path: clean(b.master_path, 500) || null,
    album_id: isUuid(b.album_id) ? b.album_id : null,
    published: !!b.published,
    created_by: u.id,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (price > 0) {
    await db.from('licenses').insert({
      beat_id: beat.id,
      name: clean(b.license_name, 80) || 'Standard',
      price_cents: price,
      file_format: clean(b.file_format, 80) || 'WAV + MP3',
      active: true,
    });
  }
  return NextResponse.json({ beat });
}

export async function DELETE(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-beat-write', limit: 120, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const id = req.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const db = adminDb();
  const { error } = await db.from('beats').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
