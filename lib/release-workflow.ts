import { ADMIN_REVIEW_STATUSES, DELIVERY_STATUSES, EDITABLE_STATUSES } from './distribution.ts';

const REVIEW_INPUT_STATUSES = ['submitted', 'in_review'] as const;
const DELIVERY_INPUT_STATUSES = ['approved', 'delivered'] as const;

export function canArtistEdit(status: unknown): boolean {
  return typeof status === 'string' && (EDITABLE_STATUSES as readonly string[]).includes(status);
}

// A release can only be reviewed from an artist-submitted state.
export function canAdminReview(status: unknown): boolean {
  return typeof status === 'string' && (REVIEW_INPUT_STATUSES as readonly string[]).includes(status);
}

// Delivery is a separate human-confirmed step after editorial approval.
export function canAdminDeliver(status: unknown): boolean {
  return typeof status === 'string' && (DELIVERY_INPUT_STATUSES as readonly string[]).includes(status);
}

export function allowedAdminStatuses(status: unknown): string[] {
  if (canAdminReview(status)) return [...ADMIN_REVIEW_STATUSES];
  if (status === 'approved') return ['delivered'];
  if (status === 'delivered') return ['live'];
  return [];
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
