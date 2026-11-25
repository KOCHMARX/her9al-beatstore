import { adminDb } from '@/lib/db';

type ObjectRules = {
  ownerId: string;
  maxBytes: number;
  mimeTypes: readonly string[];
};

export async function verifyOwnedStorageObject(
  db: ReturnType<typeof adminDb>,
  bucket: string,
  path: string,
  rules: ObjectRules,
) {
  const prefix = `${rules.ownerId}/`;
  if (!path.startsWith(prefix) || path.includes('..') || path.slice(prefix.length).includes('/')) return false;

  const name = path.slice(prefix.length);
  if (!name) return false;
  const { data, error } = await db.storage.from(bucket).list(rules.ownerId, { limit: 100, search: name });
  if (error) return false;
  const object = data?.find(candidate => candidate.name === name);
  if (!object) return false;

  const metadata = (object.metadata || {}) as Record<string, unknown>;
  const size = Number(metadata.size || 0);
  const mime = String(metadata.mimetype || metadata.contentType || '').toLowerCase();
  return Number.isFinite(size) && size > 0 && size <= rules.maxBytes && rules.mimeTypes.includes(mime);
}

function imageDimensions(buffer: Buffer) {
  const pngSignature = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(pngSignature)) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  const startOfFrame = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) return null;
    if (startOfFrame.has(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

export async function verifyReleaseArtwork(
  db: ReturnType<typeof adminDb>,
  path: string,
  minimumPixels = 1400,
) {
  const { data, error } = await db.storage.from('release-art').download(path);
  if (error || !data) return false;
  const dimensions = imageDimensions(Buffer.from(await data.arrayBuffer()));
  return !!dimensions &&
    dimensions.width === dimensions.height &&
    dimensions.width >= minimumPixels &&
    dimensions.width <= 10_000;
}
