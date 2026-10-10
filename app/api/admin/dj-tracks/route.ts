import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const db = adminDb();
  const { data, error } = await db.from('dj_tracks').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tracks: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const sourceType = String(body.source_type || 'upload');
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (!['upload', 'soundcloud'].includes(sourceType)) return NextResponse.json({ error: 'invalid source type' }, { status: 400 });
  if (sourceType === 'upload' && !body.audio_url) return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  if (sourceType === 'soundcloud' && !body.soundcloud_url) return NextResponse.json({ error: 'SoundCloud URL required' }, { status: 400 });

  const db = adminDb();
  const { data, error } = await db.from('dj_tracks').insert({
    title,
    artist: String(body.artist || '').trim() || null,
    audio_url: body.audio_url || null,
    cover_url: body.cover_url || null,
    soundcloud_url: body.soundcloud_url || null,
    bpm: Number(body.bpm) || null,
    source_type: sourceType,
    published: body.published !== false,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ track: data });
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = adminDb();
  const { error } = await db.from('dj_tracks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
