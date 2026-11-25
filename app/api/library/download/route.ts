import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { isUuid, rateLimit, rateLimitResponse } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'library-download', limit: 30, windowSeconds: 600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const item = req.nextUrl.searchParams.get('item');
  if (!isUuid(item)) return NextResponse.json({ error: 'missing item' }, { status: 400 });

  const db = adminDb();
  const { data, error } = await db.from('order_items')
    .select('id,beat:beats(title,master_path),order:orders!inner(user_id,status)')
    .eq('id', item)
    .eq('order.user_id', user.id)
    .eq('order.status', 'paid')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const beat = (data as any).beat;
  const path = String(beat?.master_path || '');
  if (!path || path.includes('..')) return NextResponse.json({ error: 'master unavailable' }, { status: 404 });
  const extension = (path.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'bin';
  const title = String(beat?.title || 'HER9AL-beat').replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 80) || 'HER9AL-beat';
  const { data: signed, error: signedError } = await db.storage.from('beat-masters').createSignedUrl(path, 60, { download: `${title}.${extension}` });
  if (signedError || !signed) return NextResponse.json({ error: 'download unavailable' }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'no-store, private' } });
}
