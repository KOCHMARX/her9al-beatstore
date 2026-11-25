import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { GENRES } from '@/lib/catalog';
import { ART_TYPES, AUDIO_TYPES, LANGUAGES, PLATFORMS, RELEASE_TYPES, LIMITS, clean, Track } from '@/lib/distribution';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { verifyOwnedStorageObject, verifyReleaseArtwork } from '@/lib/storage-object';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await adminDb().from('releases')
    .select('id,title,release_type,primary_artist,cover_url,release_date,status,admin_note,store_links,platforms,tracks,created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load releases.' }, { status: 500 });
  const releases = (data || []).map((release: any) => ({
    ...release,
    tracks: (Array.isArray(release.tracks) ? release.tracks : []).map((track: Track) => ({ title: track.title })),
  }));
  return NextResponse.json({ releases }, { headers: { 'Cache-Control': 'no-store' } });
}

function validReleaseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const selected = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(selected.getTime()) || selected.toISOString().slice(0, 10) !== value) return false;
  const minimum = new Date();
  minimum.setUTCHours(0, 0, 0, 0);
  minimum.setUTCDate(minimum.getUTCDate() + 7);
  return selected >= minimum;
}

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'distribution-release-submit', limit: 10, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const db = adminDb();
  const { data: artist, error: artistError } = await db.from('artist_profiles').select('artist_name').eq('user_id', user.id).maybeSingle();
  if (artistError) return NextResponse.json({ error: 'Could not verify artist profile.' }, { status: 503 });
  if (!artist) return NextResponse.json({ error: 'Create your artist profile first.' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });
  const title = clean(body.title, 120);
  if (!title) return bad('Release title is required.');
  if (!(RELEASE_TYPES as readonly unknown[]).includes(body.release_type)) return bad('Choose a valid release type.');
  const releaseType = body.release_type as (typeof RELEASE_TYPES)[number];

  const rawTracks = Array.isArray(body.tracks) ? body.tracks : [];
  if (rawTracks.length > LIMITS.tracks) return bad(`A release can contain up to ${LIMITS.tracks} tracks.`);
  const tracks: Track[] = rawTracks.map((track: any) => ({
    title: clean(track?.title, 120),
    audio_path: clean(track?.audio_path, 300),
    explicit: !!track?.explicit,
  }));
  if (!tracks.length) return bad('Add at least one track.');
  if (tracks.some(track => !track.title || !track.audio_path)) return bad('Every track needs a title and an audio file.');
  if (new Set(tracks.map(track => track.audio_path)).size !== tracks.length) return bad('Each track must use a separate audio file.');
  if (releaseType === 'single' && tracks.length > 3) return bad('A single can have up to 3 tracks. Choose EP or Album.');

  const audioChecks = await Promise.all(tracks.map(track => verifyOwnedStorageObject(db, 'release-audio', track.audio_path, {
    ownerId: user.id,
    maxBytes: LIMITS.audio,
    mimeTypes: AUDIO_TYPES,
  })));
  if (audioChecks.some(valid => !valid)) return bad('One or more audio uploads are missing or invalid. Upload them again.');

  const coverPath = clean(body.cover_path, 300);
  const validCover = await verifyOwnedStorageObject(db, 'release-art', coverPath, {
    ownerId: user.id,
    maxBytes: LIMITS.art,
    mimeTypes: ART_TYPES,
  });
  if (!validCover) return bad('Upload a valid cover image.');
  if (!(await verifyReleaseArtwork(db, coverPath))) return bad('Cover art must be a valid square JPG/PNG of at least 1400×1400 pixels.');
  const coverUrl = db.storage.from('release-art').getPublicUrl(coverPath).data.publicUrl;

  const platforms = [...new Set((Array.isArray(body.platforms) ? body.platforms : [])
    .filter((platform: unknown): platform is string => typeof platform === 'string' && (PLATFORMS as readonly string[]).includes(platform)))];
  if (!platforms.length) return bad('Select at least one platform.');
  if (body.rights_confirmed !== true) return bad('You must confirm you own all rights to this music.');

  const releaseDate = clean(body.release_date, 10);
  if (!validReleaseDate(releaseDate)) return bad('Choose a valid release date at least 7 days from today.');
  const requestedGenre = clean(body.genre, 40);
  const genre = (GENRES as readonly string[]).includes(requestedGenre) ? requestedGenre : 'Hip Hop';
  const requestedLanguage = clean(body.language, 30);
  const language = (LANGUAGES as readonly string[]).includes(requestedLanguage) ? requestedLanguage : 'English';
  const primaryArtist = artist.artist_name;

  const { data, error } = await db.from('releases').insert({
    user_id: user.id,
    title,
    release_type: releaseType,
    primary_artist: primaryArtist,
    featured_artists: clean(body.featured_artists, 150),
    genre,
    language,
    explicit: tracks.some(track => track.explicit),
    release_date: releaseDate,
    label: clean(body.label, 80) || primaryArtist,
    copyright_line: clean(body.copyright_line, 150) || `℗ ${new Date().getFullYear()} ${primaryArtist}`,
    cover_url: coverUrl,
    cover_path: coverPath,
    tracks,
    platforms,
    rights_confirmed: true,
    status: 'submitted',
  }).select('id').single();
  if (error || !data) {
    console.error('HER9AL RELEASE SUBMISSION ERROR', { code: error?.code });
    return NextResponse.json({ error: 'Could not submit release.' }, { status: 400 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
