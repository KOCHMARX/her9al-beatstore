import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { clean, cleanUrl } from '@/lib/distribution';
import { GENRES } from '@/lib/catalog';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await adminDb().from('artist_profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not load artist profile.' }, { status: 500 });
  return NextResponse.json(
    { profile: data || null, user: { avatar_url: user.avatar_url, email: user.email } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'distribution-artist-update', limit: 20, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const artistName = clean(body.artist_name, 60);
  if (artistName.length < 2) return NextResponse.json({ error: 'Artist name is required.' }, { status: 400 });
  const requestedGenre = clean(body.main_genre, 40);
  const mainGenre = (GENRES as readonly string[]).includes(requestedGenre) ? requestedGenre : 'Hip Hop';
  const row = {
    user_id: user.id,
    artist_name: artistName,
    bio: clean(body.bio, 1000),
    country: clean(body.country, 60),
    main_genre: mainGenre,
    instagram: clean(body.instagram, 60).replace(/^@/, ''),
    spotify_url: cleanUrl(body.spotify_url),
    apple_music_url: cleanUrl(body.apple_music_url),
    youtube_url: cleanUrl(body.youtube_url),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await adminDb().from('artist_profiles').upsert(row, { onConflict: 'user_id' }).select('*').single();
  if (error) {
    console.error('HER9AL ARTIST PROFILE ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not save artist profile.' }, { status: 400 });
  }
  return NextResponse.json({ profile: data });
}
