import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie, verifySessionToken } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = verifySessionToken(req.cookies.get(sessionCookie.name)?.value);
  return NextResponse.json({ user });
}
