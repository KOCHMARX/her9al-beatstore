import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { canonicalAdminUploadType } from '@/lib/upload-policy';
import crypto from 'crypto';

export const runtime = 'nodejs';

const MAX = {
  cover: 8 * 1024 * 1024,
  preview: 100 * 1024 * 1024,
  master: 100 * 1024 * 1024,
} as const;

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-media-upload', limit: 120, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || '') as keyof typeof MAX;
  const fileName = String(body.name || 'file.bin');
  const size = Number(body.size || 0);
  if (!['cover', 'preview', 'master'].includes(kind)) return NextResponse.json({ error: 'invalid upload kind' }, { status: 400 });
  const contentType = canonicalAdminUploadType(kind, body.contentType, fileName);
  if (!contentType) return NextResponse.json({ error: 'Unsupported file type for this upload.' }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0 || size > MAX[kind]) {
    return NextResponse.json({ error: `File is too large. ${kind} limit is ${Math.round(MAX[kind] / 1024 / 1024)} MB.` }, { status: 400 });
  }

  const ext = fileName.toLowerCase().split('.').pop()?.replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin';
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const bucket = kind === 'cover' ? 'beat-covers' : kind === 'preview' ? 'beat-previews' : 'beat-masters';
  const db = adminDb();
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not prepare upload.' }, { status: 500 });
  const publicUrl = kind === 'master' ? null : db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ bucket, path, token: data.token, signedUrl: data.signedUrl, publicUrl, contentType });
}
