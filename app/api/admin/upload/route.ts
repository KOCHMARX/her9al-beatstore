import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import crypto from 'crypto';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

const TYPES = {
  cover: new Set(['image/jpeg', 'image/png', 'image/webp']),
  preview: new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac']),
  master: new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac', 'application/zip', 'application/x-zip-compressed']),
};

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-direct-upload', limit: 30, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const kind = String(form.get('kind') || '') as keyof typeof TYPES;
  if (!file || !Object.prototype.hasOwnProperty.call(TYPES, kind)) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  const max = kind === 'cover' ? 8 * 1024 * 1024 : 100 * 1024 * 1024;
  if (file.size <= 0 || file.size > max) return NextResponse.json({ error: 'File is too large. Use the signed upload flow for large masters.' }, { status: 400 });
  if (!TYPES[kind].has(file.type)) return NextResponse.json({ error: `Unsupported ${kind} file type.` }, { status: 400 });

  const extension = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  if (!extension) return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 });
  const path = `${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${extension === 'jpeg' ? 'jpg' : extension}`;
  const bucket = kind === 'cover' ? 'beat-covers' : kind === 'preview' ? 'beat-previews' : 'beat-masters';
  const db = adminDb();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(bucket).upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: 'Could not upload file.' }, { status: 500 });
  if (kind === 'master') return NextResponse.json({ path });
  return NextResponse.json({ path, url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl });
}
