import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.set(sessionCookie.name, '', { ...sessionCookie.options, maxAge: 0 });
  return res;
}
