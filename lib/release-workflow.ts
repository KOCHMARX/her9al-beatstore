import { ADMIN_REVIEW_STATUSES, DELIVERY_STATUSES, EDITABLE_STATUSES } from './distribution.ts';

export function canArtistEdit(status: unknown): boolean {
  return typeof status === 'string' && (EDITABLE_STATUSES as readonly string[]).includes(status);
}

export function canAdminReview(status: unknown): boolean {
  return typeof status === 'string' && (ADMIN_REVIEW_STATUSES as readonly string[]).includes(status);
}

export function isDeliveryStatus(status: unknown): boolean {
  return typeof status === 'string' && (DELIVERY_STATUSES as readonly string[]).includes(status);
}

// History is artist-visible. Only the artist-facing reason may be stored there;
// private staff notes stay in releases.private_note and must never be copied here.
export function artistVisibleAuditNote(reason: unknown): string | null {
  return typeof reason === 'string' && reason.trim() ? reason.slice(0, 600) : null;
}

export function buildAuditEvent(input: {
  releaseId: unknown;
  actorId: unknown;
  from: unknown;
  to: unknown;
  note?: unknown;
}) {
  if (typeof input.releaseId !== 'string' || !input.releaseId) return null;
  if (typeof input.actorId !== 'string' || !input.actorId) return null;
  if (typeof input.to !== 'string' || !input.to) return null;
  return {
    release_id: input.releaseId,
    actor_id: input.actorId,
    from_status: typeof input.from === 'string' ? input.from : null,
    to_status: input.to,
    note: typeof input.note === 'string' ? input.note.slice(0, 600) : null,
  };
}
