import { cookies } from 'next/headers';
import { verifySessionToken, sessionCookie } from '@/lib/auth-session';
import { adminDb, AppUser } from '@/lib/db';
import { canConfirmDelivery, canViewAdmin } from './role-policy';

export async function currentUser(): Promise<AppUser|null> {
  const jar = await cookies();
  const payload = verifySessionToken(jar.get(sessionCookie.name)?.value);
  if (!payload) return null;
  const db = adminDb();
  const { data } = await db.from('app_users').select('*').eq('id', payload.id).maybeSingle();
  return data as AppUser | null;
}

export function isStaff(user: AppUser|null): user is AppUser {
  return !!user && canViewAdmin(user.role);
}
export function isManager(user: AppUser|null): user is AppUser {
  return !!user && canConfirmDelivery(user.role);
}
