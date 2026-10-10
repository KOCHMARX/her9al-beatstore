import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  const db = adminDb();

  const [{ data: beats, error: beatError }, { data: djTracks, error: djError }] = await Promise.all([
    db.from('beats')
      .select('id,title,cover_url,preview_url,bpm,genre,style,mood,published')
      .eq('published', true)
      .not('preview_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200),
    db.from('dj_tracks')
      .select('id,title,artist,audio_url,cover_url,soundcloud_url,bpm,source_type,published,created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (beatError) return NextResponse.json({ error: beatError.message }, { status: 500 });
  if (djError && !String(djError.message || '').toLowerCase().includes('does not exist')) {
    return NextResponse.json({ error: djError.message }, { status: 500 });
  }

  const site = (beats || []).map((b: any) => ({
    id: `beat:${b.id}`,
    title: b.title,
    artist: 'HER9AL',
    audio_url: b.preview_url,
    cover_url: b.cover_url,
    bpm: b.bpm,
    source_type: 'site',
    meta: [b.genre, b.style, b.mood].filter(Boolean).join(' · '),
  }));

  const curated = (djTracks || []).map((t: any) => ({
    id: `dj:${t.id}`,
    title: t.title,
    artist: t.artist || 'DJ Library',
    audio_url: t.audio_url,
    cover_url: t.cover_url,
    soundcloud_url: t.soundcloud_url,
    bpm: t.bpm,
    source_type: t.source_type,
    meta: t.source_type === 'soundcloud' ? 'SoundCloud' : 'DJ Library',
  }));

  return NextResponse.json({ tracks: [...curated, ...site] });
}
