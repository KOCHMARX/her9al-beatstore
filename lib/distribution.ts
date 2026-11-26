export const PLATFORMS = [
  'Spotify','Apple Music','YouTube Music','Amazon Music','Deezer','TikTok','Instagram / Facebook','Tidal','SoundCloud','Anghami',
] as const;

export const RELEASE_TYPES = ['single','ep','album'] as const;
export const LANGUAGES = ['English','Arabic','French','Spanish','Portuguese','German','Italian','Turkish','Other'] as const;

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  delivered: 'Delivery package prepared',
  live: 'Live (confirmed)',
  rejected: 'Rejected',
};
export const STATUSES = Object.keys(STATUS_LABEL);
export const EDITABLE_STATUSES = ['draft', 'changes_requested', 'rejected'] as const;
export const ADMIN_REVIEW_STATUSES = ['in_review', 'changes_requested', 'approved', 'rejected'] as const;
export const DELIVERY_STATUSES = ['delivered', 'live'] as const;

export const LIMITS = { audio: 300 * 1024 * 1024, art: 10 * 1024 * 1024, tracks: 20 };
export const AUDIO_TYPES = ['audio/wav','audio/x-wav','audio/wave','audio/flac','audio/x-flac','audio/mpeg'];
export const ART_TYPES = ['image/jpeg','image/png'];

export type Track = { title: string; audio_path: string; explicit?: boolean; isrc?: string };

export const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
export const cleanUrl = (v: unknown) => {
  const s = clean(v, 300);
  if (!s) return '';
  try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : ''; } catch { return ''; }
};

export function canonicalUploadType(kind: 'audio' | 'art', value: unknown, fileName: unknown) {
  const supplied = clean(value, 100).toLowerCase().split(';')[0];
  if (kind === 'art' && ART_TYPES.includes(supplied)) return supplied;
  if (kind === 'audio' && AUDIO_TYPES.includes(supplied)) return supplied;

  const extension = clean(fileName, 200).toLowerCase().split('.').pop();
  if (kind === 'art') return extension === 'png' ? 'image/png' : ['jpg', 'jpeg'].includes(extension || '') ? 'image/jpeg' : '';
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'flac') return 'audio/flac';
  if (extension === 'wav' || extension === 'wave') return 'audio/wav';
  return '';
}

export function isValidReleaseDate(value: unknown, now = new Date()) {
  const date = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const selected = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(selected.getTime()) || selected.toISOString().slice(0, 10) !== date) return false;
  const minimum = new Date(now);
  minimum.setUTCHours(0, 0, 0, 0);
  minimum.setUTCDate(minimum.getUTCDate() + 7);
  return selected >= minimum;
}
