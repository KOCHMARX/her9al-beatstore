import { cookies } from 'next/headers';
import { verifySessionToken, sessionCookie } from '@/lib/auth-session';
import { adminDb, AppUser } from '@/lib/db';

export async function currentUser(): Promise<AppUser|null> {
  const jar = await cookies();
  const payload = verifySessionToken(jar.get(sessionCookie.name)?.value);
  if (!payload) return null;
  const db = adminDb();
  const { data } = await db.from('app_users').select('*').eq('id', payload.id).maybeSingle();
  return data as AppUser | null;
}

export function isStaff(user: AppUser|null) {
  return !!user && ['owner','admin','editor'].includes(user.role);
}
export function isManager(user: AppUser|null) {
  return !!user && ['owner','admin'].includes(user.role);
}
