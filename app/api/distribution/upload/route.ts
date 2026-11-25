import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { ART_TYPES, AUDIO_TYPES, LIMITS, canonicalUploadType } from '@/lib/distribution';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

// Large media uploads go directly from the browser to Supabase through a short-lived signed token.
export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === 'art' ? 'art' : body.kind === 'audio' ? 'audio' : null;
  if (!kind) return NextResponse.json({ error: 'Invalid upload kind.' }, { status: 400 });

  const limited = await rateLimit(req, {
    action: `distribution-upload-${kind}`,
    limit: kind === 'art' ? 10 : 40,
    windowSeconds: 3600,
    identifier: user.id,
  });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const type = canonicalUploadType(kind, body.contentType, body.name);
  const size = Number(body.size || 0);
  const allowedTypes = kind === 'art' ? ART_TYPES : AUDIO_TYPES;
  if (!type || !allowedTypes.includes(type)) {
    return NextResponse.json({ error: kind === 'art' ? 'Cover must be JPG or PNG.' : 'Audio must be WAV, FLAC or MP3.' }, { status: 400 });
  }
  const max = kind === 'art' ? LIMITS.art : LIMITS.audio;
  if (!Number.isFinite(size) || size <= 0 || size > max) {
    return NextResponse.json({ error: `File too large (max ${Math.round(max / 1048576)} MB).` }, { status: 400 });
  }

  const db = adminDb();
  const { data: artist, error: artistError } = await db.from('artist_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (artistError) return NextResponse.json({ error: 'Could not verify artist profile.' }, { status: 503 });
  if (!artist) return NextResponse.json({ error: 'Create your artist profile before uploading a release.' }, { status: 400 });

  const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : type.includes('flac') ? 'flac' : type === 'audio/mpeg' ? 'mp3' : 'wav';
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const bucket = kind === 'art' ? 'release-art' : 'release-audio';
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('HER9AL DISTRIBUTION SIGNED UPLOAD ERROR', { code: (error as any)?.statusCode });
    return NextResponse.json({ error: 'Could not prepare upload.' }, { status: 500 });
  }
  const publicUrl = kind === 'art' ? db.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
  return NextResponse.json({ bucket, path, token: data.token, publicUrl, contentType: type });
}
