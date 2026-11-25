import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import crypto from 'crypto';

export const runtime = 'nodejs';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_SIZE = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No image selected.' }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
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
  const ext = extMap[file.type] || 'img';
  const path = `${u.id}/${crypto.randomUUID()}.${ext}`;
  const db = adminDb();
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from('profile-avatars')
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('HER9AL AVATAR UPLOAD ERROR:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
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
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ user: updated, url: avatarUrl });
}
