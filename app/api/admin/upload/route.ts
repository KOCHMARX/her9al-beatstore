import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { canonicalAdminUploadType } from '@/lib/upload-policy';
import crypto from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-media-upload', limit: 120, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const kind = String(form.get('kind') || '') as 'cover' | 'preview' | 'master';
  if (!file || !['cover', 'preview', 'master'].includes(kind)) return NextResponse.json({ error: 'invalid upload' }, { status: 400 });
  const contentType = canonicalAdminUploadType(kind, file.type, file.name);
  if (!contentType) return NextResponse.json({ error: 'Unsupported file type for this upload.' }, { status: 400 });
  const max = kind === 'cover' ? 8 * 1024 * 1024 : 100 * 1024 * 1024;
  if (file.size > max) return NextResponse.json({ error: 'file too large' }, { status: 400 });
  const extension = file.name.toLowerCase().split('.').pop()?.replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const bucket = kind === 'cover' ? 'beat-covers' : kind === 'preview' ? 'beat-previews' : 'beat-masters';
  const db = adminDb();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(bucket).upload(path, buf, { contentType, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (kind === 'master') return NextResponse.json({ path });
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ path, url: data.publicUrl });
}
