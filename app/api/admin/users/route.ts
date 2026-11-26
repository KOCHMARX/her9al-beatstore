import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isManager } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { canAssignRole } from '@/lib/role-policy';

export const runtime = 'nodejs';

export async function GET() {
  const u = await currentUser();
  if (!isManager(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const db = adminDb();
  const { data, error } = await db.from('app_users').select('id,email,display_name,avatar_url,role,provider,created_at').order('created_at', { ascending: false }).limit(200);
  if (error) {
    console.error('HER9AL ADMIN USERS QUERY ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not load users.' }, { status: 500 });
  }
  return NextResponse.json({ users: data || [], viewerRole: u.role }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!isManager(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-role-update', limit: 60, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.id) || !canAssignRole(u.role, body.role)) {
    return NextResponse.json({ error: 'Invalid role change.' }, { status: 400 });
  }
  if (body.id === u.id) {
    return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 });
  }

  const db = adminDb();
  const { error } = await db.from('app_users').update({ role: body.role, updated_at: new Date().toISOString() }).eq('id', body.id);
  if (error) {
    console.error('HER9AL ADMIN ROLE UPDATE ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not update role.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
