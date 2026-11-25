import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { ART_TYPES, AUDIO_TYPES, LIMITS } from '@/lib/distribution';

export const runtime = 'nodejs';

// Returns a signed upload token so large WAV files go straight from the browser to Supabase Storage.
export async function POST(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === 'art' ? 'art' : b.kind === 'audio' ? 'audio' : null;
  const type = String(b.contentType || '').toLowerCase();
  const size = Number(b.size || 0);
  if (!kind) return NextResponse.json({ error: 'Invalid upload kind.' }, { status: 400 });
  const okType = kind === 'art' ? ART_TYPES.includes(type) : AUDIO_TYPES.includes(type);
  if (!okType) return NextResponse.json({ error: kind === 'art' ? 'Cover must be JPG or PNG.' : 'Audio must be WAV, FLAC or MP3.' }, { status: 400 });
  const max = kind === 'art' ? LIMITS.art : LIMITS.audio;
  if (!Number.isFinite(size) || size <= 0 || size > max) return NextResponse.json({ error: `File too large (max ${Math.round(max / 1048576)} MB).` }, { status: 400 });

  const ext = type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : type.includes('flac') ? 'flac' : type.includes('mpeg') ? 'mp3' : 'wav';
  const path = `${u.id}/${crypto.randomUUID()}.${ext}`;
  const bucket = kind === 'art' ? 'release-art' : 'release-audio';
  const db = adminDb();
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not prepare upload.' }, { status: 500 });
  const publicUrl = kind === 'art' ? db.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
  return NextResponse.json({ bucket, path, token: data.token, publicUrl });
}
