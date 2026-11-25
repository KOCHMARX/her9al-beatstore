import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { clean, cleanUrl } from '@/lib/distribution';

export const runtime = 'nodejs';

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data } = await adminDb().from('artist_profiles').select('*').eq('user_id', u.id).maybeSingle();
  return NextResponse.json({ profile: data || null, user: { avatar_url: u.avatar_url, email: u.email } });
}

export async function PUT(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const artist_name = clean(b.artist_name, 60);
  if (artist_name.length < 2) return NextResponse.json({ error: 'Artist name is required.' }, { status: 400 });
  const row = {
    user_id: u.id, artist_name, bio: clean(b.bio, 1000), country: clean(b.country, 60), main_genre: clean(b.main_genre, 40),
    instagram: clean(b.instagram, 60).replace(/^@/, ''), spotify_url: cleanUrl(b.spotify_url),
    apple_music_url: cleanUrl(b.apple_music_url), youtube_url: cleanUrl(b.youtube_url), updated_at: new Date().toISOString(),
  };
  const { data, error } = await adminDb().from('artist_profiles').upsert(row, { onConflict: 'user_id' }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile: data });
}
