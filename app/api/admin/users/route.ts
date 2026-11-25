import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isManager, isOwner } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isManager(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { data, error } = await adminDb()
    .from('app_users')
    .select('id,email,display_name,avatar_url,role,provider,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: 'Could not load users.' }, { status: 500 });
  return NextResponse.json({ users: data || [], viewerRole: user.role });
}

export async function PATCH(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isManager(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit(req, { action: 'admin-role-update', limit: 60, windowSeconds: 3600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const role = String(body.role || '');
  if (!isUuid(body.id) || !['customer', 'editor', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role update.' }, { status: 400 });
  }

  const db = adminDb();
  const { data: target, error: targetError } = await db.from('app_users').select('id,role').eq('id', body.id).maybeSingle();
  if (targetError || !target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  // The owner role is migration-only and cannot be granted, replaced, or demoted here.
  if (target.role === 'owner') return NextResponse.json({ error: 'The owner role is protected.' }, { status: 403 });
  // Admins can manage customers/editors; only the owner can create or modify admins.
  if (!isOwner(user) && (target.role === 'admin' || role === 'admin')) {
    return NextResponse.json({ error: 'Only the owner can manage admins.' }, { status: 403 });
  }

  const { error } = await db.from('app_users').update({ role, updated_at: new Date().toISOString() }).eq('id', target.id);
  if (error) {
    console.error('HER9AL ROLE UPDATE ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not update role.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
