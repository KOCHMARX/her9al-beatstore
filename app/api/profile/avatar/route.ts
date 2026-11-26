import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { canonicalAdminUploadType, hasImageSignature } from '@/lib/upload-policy';
import crypto from 'crypto';

export const runtime = 'nodejs';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_SIZE = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'profile-avatar', limit: 20, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No image selected.' }, { status: 400 });
  // Canonicalize from the file extension: a browser-supplied MIME alone is not trusted.
  const contentType = canonicalAdminUploadType('cover', '', file.name);
  if (!contentType || !ALLOWED.has(contentType)) {
    return NextResponse.json({ error: 'Use PNG, JPG/JPEG, WEBP or GIF.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Image is too large. Maximum 8 MB.' }, { status: 400 });
  }

  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = extMap[contentType];
  const path = `${u.id}/${crypto.randomUUID()}.${ext}`;
  const db = adminDb();
  const buf = Buffer.from(await file.arrayBuffer());
  if (!hasImageSignature(contentType, buf)) {
    return NextResponse.json({ error: 'The image file does not match its extension.' }, { status: 400 });
  }

  const { error: uploadError } = await db.storage
    .from('profile-avatars')
    .upload(path, buf, { contentType, upsert: false });

  if (uploadError) {
    console.error('HER9AL AVATAR UPLOAD ERROR', { code: (uploadError as any)?.statusCode });
    return NextResponse.json({ error: 'Could not upload image.' }, { status: 500 });
  }

  const { data: publicData } = db.storage.from('profile-avatars').getPublicUrl(path);
  const avatarUrl = publicData.publicUrl;

  const { data: updated, error: updateError } = await db
    .from('app_users')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', u.id)
    .select('id,email,display_name,avatar_url,role,provider')
    .single();

  if (updateError) {
    console.error('HER9AL AVATAR PROFILE ERROR', { code: updateError.code });
    return NextResponse.json({ error: 'Could not update profile.' }, { status: 500 });
  }

  return NextResponse.json({ user: updated, url: avatarUrl });
}
