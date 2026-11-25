import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { GENRES, MOODS, STYLES } from '@/lib/catalog';
import { isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

function storageUrl(value: unknown, bucket: 'beat-covers' | 'beat-previews') {
  const raw = String(value || '').trim().slice(0, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.pathname.includes(`/storage/v1/object/public/${bucket}/`) ? url.toString() : null;
  } catch {
    return null;
  }
}

function masterPath(value: unknown) {
  const path = String(value || '').trim().slice(0, 500);
  return path && !path.includes('..') && !path.startsWith('/') ? path : null;
}

async function staffUser() {
  const user = await currentUser();
  if (!user) return { user: null, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!isStaff(user)) return { user: null, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user, response: null };
}

export async function GET() {
  const auth = await staffUser();
  if (auth.response) return auth.response;
  const { data, error } = await adminDb().from('beats').select('*,licenses(*),albums(id,title,cover_url)').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load beats.' }, { status: 500 });
  return NextResponse.json({ beats: data || [], viewerRole: auth.user!.role });
}

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const auth = await staffUser();
  if (auth.response) return auth.response;
  const limited = await rateLimit(req, { action: 'admin-beat-create', limit: 120, windowSeconds: 3600, identifier: auth.user!.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  const bpmValue = Number(body.bpm);
  const bpm = Number.isInteger(bpmValue) && bpmValue >= 20 && bpmValue <= 400 ? bpmValue : null;
  const genre = (GENRES as readonly string[]).includes(body.genre) ? body.genre : null;
  const style = (STYLES as readonly string[]).includes(body.style) ? body.style : null;
  const mood = (MOODS as readonly string[]).includes(body.mood) ? body.mood : null;
  const coverUrl = storageUrl(body.cover_url, 'beat-covers');
  const previewUrl = storageUrl(body.preview_url, 'beat-previews');
  const privateMaster = masterPath(body.master_path);
  if (body.cover_url && !coverUrl) return NextResponse.json({ error: 'Invalid cover upload.' }, { status: 400 });
  if (body.preview_url && !previewUrl) return NextResponse.json({ error: 'Invalid preview upload.' }, { status: 400 });
  if (body.master_path && !privateMaster) return NextResponse.json({ error: 'Invalid master upload.' }, { status: 400 });
  const albumId = body.album_id ? String(body.album_id) : null;
  if (albumId && !isUuid(albumId)) return NextResponse.json({ error: 'Invalid album.' }, { status: 400 });

  const slugBase = String(body.slug || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100) || 'beat';
  const slug = `${slugBase}-${Date.now().toString().slice(-5)}`;
  const db = adminDb();
  const { data: beat, error } = await db.from('beats').insert({
    title,
    slug,
    bpm,
    musical_key: String(body.musical_key || '').trim().slice(0, 20) || null,
    mood,
    genre,
    style,
    description: String(body.description || '').trim().slice(0, 1200) || null,
    cover_url: coverUrl,
    preview_url: previewUrl,
    master_path: privateMaster,
    album_id: albumId,
    published: !!body.published,
    created_by: auth.user!.id,
  }).select('*').single();
  if (error || !beat) {
    console.error('HER9AL BEAT CREATE ERROR', { code: error?.code });
    return NextResponse.json({ error: 'Could not create beat.' }, { status: 500 });
  }

  const numericPrice = Number(body.price);
  const price = Number.isFinite(numericPrice) ? Math.max(0, Math.min(10_000_000, Math.round(numericPrice * 100))) : 0;
  if (price > 0) {
    const { error: licenseError } = await db.from('licenses').insert({
      beat_id: beat.id,
      name: String(body.license_name || 'Standard').trim().slice(0, 80) || 'Standard',
      price_cents: price,
      file_format: String(body.file_format || 'WAV + MP3').trim().slice(0, 80),
      active: true,
    });
    if (licenseError) return NextResponse.json({ error: 'Beat created, but its license could not be added.' }, { status: 500 });
  }
  return NextResponse.json({ beat }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const auth = await staffUser();
  if (auth.response) return auth.response;
  const limited = await rateLimit(req, { action: 'admin-beat-delete', limit: 30, windowSeconds: 3600, identifier: auth.user!.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const id = req.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid beat.' }, { status: 400 });
  const { data, error } = await adminDb().from('beats').delete().eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'This beat could not be deleted. Purchased records are protected.' }, { status: 409 });
  if (!data) return NextResponse.json({ error: 'Beat not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
