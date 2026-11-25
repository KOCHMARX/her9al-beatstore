import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isManager, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { STATUSES, clean, cleanUrl, Track } from '@/lib/distribution';
import { buildDeliveryPackage } from '@/lib/distributor';
import { isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const db = adminDb();
  const { data, error } = await db.from('releases').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: 'Could not load distribution queue.' }, { status: 500 });

  const releases = data || [];
  const userIds = [...new Set(releases.map(release => release.user_id))];
  const { data: artists, error: artistError } = userIds.length
    ? await db.from('artist_profiles').select('*').in('user_id', userIds)
    : { data: [], error: null };
  if (artistError) return NextResponse.json({ error: 'Could not load artist profiles.' }, { status: 500 });
  const artistByUser = new Map((artists || []).map(artist => [artist.user_id, artist]));

  const audioPaths = [...new Set(releases.flatMap(release =>
    ((Array.isArray(release.tracks) ? release.tracks : []) as Track[]).map(track => track.audio_path).filter(Boolean),
  ))];
  const { data: signedFiles } = audioPaths.length
    ? await db.storage.from('release-audio').createSignedUrls(audioPaths, 3600)
    : { data: [] };
  const urlByPath = new Map((signedFiles || []).map(file => [file.path, file.signedUrl || null]));

  const output = releases.map(release => {
    const artist = artistByUser.get(release.user_id) || null;
    const tracks = (Array.isArray(release.tracks) ? release.tracks : []) as Track[];
    const files = tracks.map(track => ({ title: track.title, url: urlByPath.get(track.audio_path) || null }));
    return { ...release, artist, files, package: buildDeliveryPackage(release, artist) };
  });
  return NextResponse.json({ releases: output, viewerRole: user.role }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-release-update', limit: 120, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.id) || !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (['delivered', 'live'].includes(body.status)) {
    if (!isManager(user)) return NextResponse.json({ error: 'Only an owner or admin can confirm delivery.' }, { status: 403 });
    if (body.delivery_confirmed !== true) {
      return NextResponse.json({ error: 'Confirm real licensed-distributor delivery before using this status.' }, { status: 400 });
    }
  }

  const links = body.store_links && typeof body.store_links === 'object' ? body.store_links : {};
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: body.status,
    admin_note: clean(body.admin_note, 600),
    upc: clean(body.upc, 20),
    store_links: {
      spotify: cleanUrl(links.spotify),
      apple: cleanUrl(links.apple),
      youtube: cleanUrl(links.youtube),
    },
    reviewed_by: user.id,
    reviewed_at: now,
    updated_at: now,
  };
  if (['delivered', 'live'].includes(body.status)) patch.delivered_at = now;

  const { data, error } = await adminDb().from('releases').update(patch).eq('id', body.id).select('id').maybeSingle();
  if (error) {
    console.error('HER9AL RELEASE REVIEW ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not update release.' }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
