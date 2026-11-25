import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/auth-session';
import { appOrigin, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const res = NextResponse.redirect(new URL('/', appOrigin(req)), { status: 303 });
  res.cookies.set(sessionCookie.name, '', { ...sessionCookie.options, maxAge: 0 });
  return res;
}
