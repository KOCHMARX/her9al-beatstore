import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { canonicalAdminUploadType } from '@/lib/upload-policy';

export const runtime = 'nodejs';
const MAX = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'distribution-artist-image', limit: 20, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No image selected.' }, { status: 400 });
  const contentType = canonicalAdminUploadType('cover', '', file.name);
  if (!contentType) return NextResponse.json({ error: 'Use a PNG or JPG/JPEG image.' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'Image is too large. Maximum 10 MB.' }, { status: 400 });

  const db = adminDb();
  const { data: profile } = await db.from('artist_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Create your artist profile first.' }, { status: 400 });

  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const path = `${user.id}/artist-image.${ext}`;
  const { error: uploadError } = await db.storage.from('release-art').upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType, upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: 'Could not upload image.' }, { status: 500 });
  const url = db.storage.from('release-art').getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await db.from('artist_profiles').update({ image_url: url, updated_at: new Date().toISOString() }).eq('user_id', user.id);
  if (updateError?.code === '42703') {
    return NextResponse.json({ error: 'Artist images require the v12 workflow schema on this project.' }, { status: 503 });
  }
  if (updateError) return NextResponse.json({ error: 'Could not save artist image.' }, { status: 400 });
  return NextResponse.json({ image_url: url });
}
