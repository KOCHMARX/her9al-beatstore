// Server-side role rules. Roles from a session are verified against app_users in currentUser();
// client-supplied roles are never trusted.
export const ASSIGNABLE_ROLES = ['customer', 'editor', 'admin', 'owner'] as const;
export const STAFF_ROLES = ['owner', 'admin', 'editor'] as const;
export const MANAGER_ROLES = ['owner', 'admin'] as const;

export function canViewAdmin(role: unknown): boolean {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role);
}

export function canConfirmDelivery(role: unknown): boolean {
  return typeof role === 'string' && (MANAGER_ROLES as readonly string[]).includes(role);
}

// Email signup is unauthenticated: it can never grant a privileged role, even when
// the submitted address matches OWNER_EMAIL. Owners come from verified provider
// login or an existing owner's explicit admin role change.
export function newEmailAccountRole(): 'customer' {
  return 'customer';
}

export function canAssignRole(actorRole: unknown, targetRole: unknown): boolean {
  if (typeof targetRole !== 'string' || !(ASSIGNABLE_ROLES as readonly string[]).includes(targetRole)) return false;
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return targetRole === 'customer' || targetRole === 'editor';
  return false;
}
