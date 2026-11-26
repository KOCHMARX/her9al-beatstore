import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { rateLimit, rateLimitResponse } from '@/lib/api-security';
import { downloadMaster } from '@/lib/beatstore-routes';

export const runtime = 'nodejs';

// Only a paid order item owned by the signed-in user can produce a 60s private-master URL.
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'library-download', limit: 120, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const result = await downloadMaster({ db: adminDb(), user: u, itemId: req.nextUrl.searchParams.get('item') });
  if (result.status !== 302 || !result.body?.signedUrl) {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.redirect(result.body.signedUrl);
}
