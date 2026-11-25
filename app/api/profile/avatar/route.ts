import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import crypto from 'crypto';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_SIZE = 8 * 1024 * 1024;

function hasExpectedSignature(buffer: Buffer, type: string) {
  if (type === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (type === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString());
  return false;
}

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'profile-avatar', limit: 10, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No image selected.' }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Use PNG, JPG/JPEG, WEBP or GIF.' }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: 'The selected image is empty.' }, { status: 400 });
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
  const ext = extMap[file.type] || 'img';
  const path = `${u.id}/${crypto.randomUUID()}.${ext}`;
  const db = adminDb();
  const buf = Buffer.from(await file.arrayBuffer());
  if (!hasExpectedSignature(buf, file.type)) {
    return NextResponse.json({ error: 'The selected file is not a valid image.' }, { status: 400 });
  }

  const { error: uploadError } = await db.storage
    .from('profile-avatars')
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('HER9AL AVATAR UPLOAD ERROR:', uploadError);
    return NextResponse.json({ error: 'Could not upload profile photo.' }, { status: 500 });
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
    console.error('HER9AL AVATAR PROFILE ERROR:', updateError);
    return NextResponse.json({ error: 'Could not update profile photo.' }, { status: 500 });
  }

  return NextResponse.json({ user: updated, url: avatarUrl });
}
