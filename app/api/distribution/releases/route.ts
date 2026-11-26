import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { GENRES } from '@/lib/catalog';
import {
  ART_TYPES, AUDIO_TYPES, LANGUAGES, PLATFORMS, RELEASE_TYPES, LIMITS,
  clean, isValidReleaseDate, Track,
} from '@/lib/distribution';
import { rateLimit, rateLimitResponse, rejectCrossSite, isUuid } from '@/lib/api-security';
import { verifyOwnedStorageObject, verifyReleaseArtwork } from '@/lib/storage-object';
import { buildAuditEvent, canArtistEdit } from '@/lib/release-workflow';

export const runtime = 'nodejs';

const FIELDS = 'id,title,release_type,primary_artist,cover_url,cover_path,release_date,status,admin_note,reject_reason,store_links,platforms,tracks,rights_confirmed,created_at,updated_at';
const LEGACY_FIELDS = FIELDS.replace(',reject_reason', '');

type Validation = { error: string } | { payload: Record<string, unknown> };

async function writeEvent(db: ReturnType<typeof adminDb>, event: ReturnType<typeof buildAuditEvent>) {
  if (!event) return;
  const { error } = await db.from('release_events').insert(event);
  if (error) console.warn('HER9AL RELEASE AUDIT EVENT SKIPPED', { code: error.code });
}

async function fetchReleases(db: ReturnType<typeof adminDb>, userId: string, id?: string) {
  let query: any = db.from('releases').select(FIELDS).eq('user_id', userId);
  if (id) query = query.eq('id', id).maybeSingle();
  else query = query.order('created_at', { ascending: false });
  let result = await query;
  if (result.error?.code === '42703') {
    let legacy: any = db.from('releases').select(LEGACY_FIELDS).eq('user_id', userId);
    legacy = id ? legacy.eq('id', id).maybeSingle() : legacy.order('created_at', { ascending: false });
    result = await legacy;
  }
  return result;
}

async function validateDraft(db: ReturnType<typeof adminDb>, body: any, userId: string): Promise<Validation> {
  const title = clean(body.title, 120);
  if (!title) return { error: 'Release title is required.' };
  if (!(RELEASE_TYPES as readonly unknown[]).includes(body.release_type)) return { error: 'Choose a valid release type.' };

  const rawTracks = Array.isArray(body.tracks) ? body.tracks : [];
  if (rawTracks.length > LIMITS.tracks) return { error: `A release can contain up to ${LIMITS.tracks} tracks.` };
  const tracks: Track[] = rawTracks.map((track: any) => ({
    title: clean(track?.title, 120),
    audio_path: clean(track?.audio_path, 300),
    explicit: !!track?.explicit,
  }));
  if (tracks.some(track => !track.title)) return { error: 'Every track needs a title.' };
  if (new Set(tracks.map(track => track.audio_path).filter(Boolean)).size !== tracks.map(track => track.audio_path).filter(Boolean).length) {
    return { error: 'Each track must use a separate audio file.' };
  }
  const uploaded = tracks.filter(track => track.audio_path);
  const audioChecks = await Promise.all(uploaded.map(track => verifyOwnedStorageObject(db, 'release-audio', track.audio_path, {
    ownerId: userId, maxBytes: LIMITS.audio, mimeTypes: AUDIO_TYPES,
  })));
  if (audioChecks.some(valid => !valid)) return { error: 'One or more audio uploads are missing or invalid. Upload them again.' };

  const coverPath = clean(body.cover_path, 300);
  if (coverPath) {
    const validCover = await verifyOwnedStorageObject(db, 'release-art', coverPath, {
      ownerId: userId, maxBytes: LIMITS.art, mimeTypes: ART_TYPES,
    });
    if (!validCover) return { error: 'Upload a valid cover image.' };
    if (!(await verifyReleaseArtwork(db, coverPath))) return { error: 'Cover art must be a valid square JPG/PNG of at least 1400×1400 pixels.' };
  }

  const releaseDate = clean(body.release_date, 10);
  if (releaseDate && !isValidReleaseDate(releaseDate)) return { error: 'Choose a valid release date at least 7 days from today.' };
  const requestedGenre = clean(body.genre, 40);
  const requestedLanguage = clean(body.language, 30);

  return {
    payload: {
      title,
      release_type: body.release_type,
      featured_artists: clean(body.featured_artists, 150),
      genre: (GENRES as readonly string[]).includes(requestedGenre) ? requestedGenre : 'Hip Hop',
      language: (LANGUAGES as readonly string[]).includes(requestedLanguage) ? requestedLanguage : 'English',
      explicit: tracks.some(track => track.explicit),
      release_date: releaseDate || null,
      label: clean(body.label, 80),
      copyright_line: clean(body.copyright_line, 150),
      cover_path: coverPath || null,
      cover_url: coverPath ? db.storage.from('release-art').getPublicUrl(coverPath).data.publicUrl : null,
      tracks,
      platforms: [...new Set((Array.isArray(body.platforms) ? body.platforms : [])
        .filter((platform: unknown): platform is string => typeof platform === 'string' && (PLATFORMS as readonly string[]).includes(platform)))],
      rights_confirmed: body.rights_confirmed === true,
    },
  };
}

async function validateSubmission(db: ReturnType<typeof adminDb>, body: any, userId: string, primaryArtist: string): Promise<Validation> {
  const draft = await validateDraft(db, body, userId);
  if ('error' in draft) return draft;
  const payload = draft.payload;
  if (!(payload.tracks as Track[]).length) return { error: 'Add at least one track.' };
  if ((payload.tracks as Track[]).some(track => !track.audio_path)) return { error: 'Every track needs a title and an audio file.' };
  if ((payload.release_type === 'single') && (payload.tracks as Track[]).length > 3) {
    return { error: 'A single can have up to 3 tracks. Choose EP or Album.' };
  }
  if (!payload.cover_path) return { error: 'Upload a valid cover image.' };
  if (!(payload.platforms as string[]).length) return { error: 'Select at least one platform.' };
  if (body.rights_confirmed !== true) return { error: 'You must confirm you own all rights to this music.' };
  if (!payload.release_date) return { error: 'Choose a valid release date at least 7 days from today.' };
  payload.label = payload.label || primaryArtist;
  payload.copyright_line = payload.copyright_line || `℗ ${new Date().getFullYear()} ${primaryArtist}`;
  payload.rights_confirmed = true;
  return { payload };
}

function schemaError(error: any) {
  if (error?.code === '23514') {
    return NextResponse.json({ error: 'This workflow step needs the v12 schema on this project. Ask the administrator to apply the prepared migration.' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Could not save release.' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id && !isUuid(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const db = adminDb();
  const { data, error } = await fetchReleases(db, user.id, id || undefined);
  if (error) {
    console.error('HER9AL RELEASE LIST ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not load releases.' }, { status: 500 });
  }
  if (id && !data) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });

  if (id) {
    const { data: events } = await db.from('release_events').select('id,from_status,to_status,note,created_at')
      .eq('release_id', id).order('created_at', { ascending: false }).limit(50);
    return NextResponse.json({ release: { ...data, events: events || [] } }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const releases = ((data || []) as any[]).map(release => ({
    ...release,
    tracks: (Array.isArray(release.tracks) ? release.tracks : []).map((track: Track) => ({ title: track.title })),
  }));
  return NextResponse.json({ releases }, { headers: { 'Cache-Control': 'no-store' } });
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
  const draft = body.save_draft === true;
  const validation = draft
    ? await validateDraft(db, body, user.id)
    : await validateSubmission(db, body, user.id, artist.artist_name);
  if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 });

  const status = draft ? 'draft' : 'submitted';
  const row = {
    user_id: user.id,
    primary_artist: artist.artist_name,
    ...validation.payload,
    status,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('releases').insert(row).select('id,status').single();
  if (error) {
    console.error('HER9AL RELEASE SUBMISSION ERROR', { code: error.code });
    return schemaError(error);
  }
  await writeEvent(db, buildAuditEvent({
    releaseId: data.id, actorId: user.id, from: null, to: status,
    note: draft ? 'Draft saved.' : 'Submitted for review.',
  }));
  return NextResponse.json({ id: data.id, status: data.status }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'distribution-release-submit', limit: 10, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.id)) return NextResponse.json({ error: 'Invalid release id.' }, { status: 400 });
  const db = adminDb();
  const { data: existing } = await db.from('releases').select('id,status,primary_artist').eq('id', body.id).eq('user_id', user.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
  if (!canArtistEdit(existing.status)) return NextResponse.json({ error: 'This release cannot be edited in its current status.' }, { status: 403 });

  const submit = body.submit === true;
  const validation = submit
    ? await validateSubmission(db, body, user.id, existing.primary_artist)
    : await validateDraft(db, body, user.id);
  if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 });

  const status = submit ? 'submitted' : 'draft';
  const { data, error } = await db.from('releases').update({
    ...validation.payload,
    status,
    updated_at: new Date().toISOString(),
  }).eq('id', body.id).eq('user_id', user.id).select('id,status').maybeSingle();
  if (error) {
    console.error('HER9AL RELEASE EDIT ERROR', { code: error.code });
    return schemaError(error);
  }
  if (!data) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
  await writeEvent(db, buildAuditEvent({
    releaseId: body.id, actorId: user.id, from: existing.status, to: status,
    note: submit ? 'Resubmitted after review.' : 'Draft updated.',
  }));
  return NextResponse.json({ id: data.id, status: data.status });
}
