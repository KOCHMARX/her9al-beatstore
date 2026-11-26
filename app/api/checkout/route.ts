import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { appOrigin, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { handleCheckout } from '@/lib/beatstore-routes';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'checkout-create', limit: 20, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const result = await handleCheckout({
    db: adminDb(),
    user: u,
    body,
    stripeKey: process.env.STRIPE_SECRET_KEY,
    fetchImpl: fetch,
    origin: appOrigin(req),
    storeCurrency: process.env.STORE_CURRENCY,
  });
  if (!result.body?.url) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json({ url: result.body.url }, { headers: { 'Cache-Control': 'no-store' } });
}
