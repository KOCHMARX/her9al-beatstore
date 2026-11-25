import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { PLATFORMS, RELEASE_TYPES, LIMITS, clean, Track } from '@/lib/distribution';

export const runtime = 'nodejs';

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await adminDb().from('releases')
    .select('id,title,release_type,primary_artist,cover_url,release_date,status,admin_note,store_links,platforms,tracks,created_at')
    .eq('user_id', u.id).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const releases = (data || []).map((r: any) => ({ ...r, tracks: (r.tracks || []).map((t: Track) => ({ title: t.title })) }));
  return NextResponse.json({ releases });
}

export async function POST(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = adminDb();
  const { data: artist } = await db.from('artist_profiles').select('artist_name').eq('user_id', u.id).maybeSingle();
  if (!artist) return NextResponse.json({ error: 'Create your artist profile first.' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const err = (m: string) => NextResponse.json({ error: m }, { status: 400 });

  const title = clean(b.title, 120);
  if (!title) return err('Release title is required.');
  const release_type = RELEASE_TYPES.includes(b.release_type) ? b.release_type : 'single';
  const primary_artist = clean(b.primary_artist, 80) || artist.artist_name;

  const tracks: Track[] = (Array.isArray(b.tracks) ? b.tracks : []).slice(0, LIMITS.tracks).map((t: any) => ({
    title: clean(t?.title, 120), audio_path: clean(t?.audio_path, 300), explicit: !!t?.explicit,
  }));
  if (!tracks.length) return err('Add at least one track.');
  if (tracks.some(t => !t.title || !t.audio_path)) return err('Every track needs a title and an audio file.');
  if (tracks.some(t => !t.audio_path.startsWith(`${u.id}/`))) return err('Invalid audio file.');
  if (release_type === 'single' && tracks.length > 3) return err('A single can have up to 3 tracks. Choose EP or Album.');

  const cover_url = clean(b.cover_url, 500);
  if (!cover_url.includes('/release-art/')) return err('Upload your cover art.');

  const platforms = (Array.isArray(b.platforms) ? b.platforms : []).filter((p: string) => (PLATFORMS as readonly string[]).includes(p));
  if (!platforms.length) return err('Select at least one platform.');
  if (!b.rights_confirmed) return err('You must confirm you own all rights to this music.');

  const release_date = clean(b.release_date, 10);
  if (release_date && Number.isNaN(Date.parse(release_date))) return err('Invalid release date.');

  const { data, error } = await db.from('releases').insert({
    user_id: u.id, title, release_type, primary_artist, featured_artists: clean(b.featured_artists, 150),
    genre: clean(b.genre, 40), language: clean(b.language, 30) || 'English', explicit: tracks.some(t => t.explicit),
    release_date: release_date || null, label: clean(b.label, 80) || primary_artist,
    copyright_line: clean(b.copyright_line, 150) || `℗ ${new Date().getFullYear()} ${primary_artist}`,
    cover_url, tracks, platforms, rights_confirmed: true, status: 'submitted',
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
