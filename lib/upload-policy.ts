// Admin media uploads: trust the verified canonical type from filename/extension,
// never the browser-supplied MIME string alone (public buckets must not serve HTML).
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

export function canonicalAdminUploadType(kind: 'cover' | 'preview' | 'master', mime: unknown, fileName: unknown): string | null {
  const allowed = ALLOWED[kind];
  if (!allowed) return null;
  const supplied = typeof mime === 'string' ? mime.trim().toLowerCase().split(';')[0] : '';
  if (supplied && allowed.includes(supplied)) return supplied;
  const extension = typeof fileName === 'string' ? fileName.trim().toLowerCase().split('.').pop() || '' : '';
  const inferred = EXTENSION[extension];
  return inferred && allowed.includes(inferred) ? inferred : null;
}
