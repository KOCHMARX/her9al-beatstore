import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import crypto from 'crypto';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

const RULES = {
  cover: {
    max: 8 * 1024 * 1024,
    types: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
  },
  preview: {
    max: 100 * 1024 * 1024,
    types: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac'],
    extensions: ['mp3', 'wav', 'flac'],
  },
  master: {
    max: 500 * 1024 * 1024,
    types: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac', 'application/zip', 'application/x-zip-compressed'],
    extensions: ['mp3', 'wav', 'flac', 'zip'],
  },
} as const;

function canonicalType(kind: keyof typeof RULES, supplied: string, extension: string) {
  const type = supplied.toLowerCase().split(';')[0];
  if ((RULES[kind].types as readonly string[]).includes(type)) return type;
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'flac') return 'audio/flac';
  if (extension === 'zip') return 'application/zip';
  return '';
}

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-signed-upload', limit: 100, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || '') as keyof typeof RULES;
  if (!Object.prototype.hasOwnProperty.call(RULES, kind)) return NextResponse.json({ error: 'Invalid upload kind.' }, { status: 400 });
  const fileName = String(body.name || '').slice(0, 255);
  const extension = (fileName.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rule = RULES[kind];
  const type = canonicalType(kind, String(body.contentType || ''), extension);
  const size = Number(body.size || 0);
  if (!(rule.extensions as readonly string[]).includes(extension) || !(rule.types as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `Unsupported ${kind} file type.` }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > rule.max) {
    return NextResponse.json({ error: `File is too large. ${kind} limit is ${Math.round(rule.max / 1048576)} MB.` }, { status: 400 });
  }

  const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
  const path = `${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${normalizedExtension}`;
  const bucket = kind === 'cover' ? 'beat-covers' : kind === 'preview' ? 'beat-previews' : 'beat-masters';
  const db = adminDb();
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: 'Could not prepare upload.' }, { status: 500 });
  const publicUrl = kind === 'master' ? null : db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ bucket, path, token: data.token, publicUrl, contentType: type });
}
