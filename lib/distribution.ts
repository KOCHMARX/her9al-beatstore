export const PLATFORMS = [
  'Spotify','Apple Music','YouTube Music','Amazon Music','Deezer','TikTok','Instagram / Facebook','Tidal','SoundCloud','Anghami',
] as const;

export const RELEASE_TYPES = ['single','ep','album'] as const;
export const LANGUAGES = ['English','Arabic','French','Spanish','Portuguese','German','Italian','Turkish','Other'] as const;

export const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  in_review: 'In review',
  approved: 'Approved',
  delivered: 'Sent to stores',
  live: 'Live',
  rejected: 'Needs changes',
};
export const STATUSES = Object.keys(STATUS_LABEL);

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
