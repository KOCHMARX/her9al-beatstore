import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { createStaffLicense } from '@/lib/beatstore-routes';

export const runtime = 'nodejs';

// Staff repair path for existing beats: adds a license without SQL or direct data access.
export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limited = await rateLimit(req, {
    action: 'admin-license-create', limit: 120, windowSeconds: 3600, identifier: user.id,
  });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const body = await req.json().catch(() => ({}));
  const result = await createStaffLicense({ db: adminDb(), user, body });
  return NextResponse.json(result.body, { status: result.status });
}
