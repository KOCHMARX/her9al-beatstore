// Admin media uploads: trust only the filename/extension to choose the canonical type,
// never a browser-supplied MIME string (public buckets must not serve HTML).
const IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const AUDIO = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac', 'audio/x-flac'] as const;

const ALLOWED: Record<'cover' | 'preview' | 'master', readonly string[]> = {
  cover: IMAGE,
  preview: AUDIO,
  master: [...AUDIO, 'application/zip'],
};

const EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', wave: 'audio/wav', flac: 'audio/flac', zip: 'application/zip',
};

export function canonicalAdminUploadType(kind: 'cover' | 'preview' | 'master', _mime: unknown, fileName: unknown): string | null {
  const allowed = ALLOWED[kind];
  if (!allowed) return null;
  const extension = typeof fileName === 'string' ? fileName.trim().toLowerCase().split('.').pop() || '' : '';
  const inferred = EXTENSION[extension];
  return inferred && allowed.includes(inferred) ? inferred : null;
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

// Image uploads also verify real bytes before reaching a public bucket.
export function hasImageSignature(contentType: string, input: Uint8Array | ArrayBuffer): boolean {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (contentType === 'image/png') return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === 'image/jpeg') return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === 'image/gif') return startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  if (contentType === 'image/webp') return startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(bytes.subarray(8, 12), [0x57, 0x45, 0x42, 0x50]);
  return false;
}
