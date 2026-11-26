import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { claimFreeLicense } from '@/lib/beatstore-routes';

export const runtime = 'nodejs';

// The server resolves the license, beat and master. Clients never supply a price or amount.
export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  const limited = await rateLimit(req, {
    action: 'library-claim-free', limit: 30, windowSeconds: 3600, identifier: user.id,
  });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const result = await claimFreeLicense({ db: adminDb(), user, body });
  return NextResponse.json(result.body, { status: result.status });
}
