import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { adminDb } from '@/lib/db';
import { verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });

  const db = adminDb();
  const { data: user } = await db.from('app_users').select('*').eq('provider', 'email').eq('email', email).maybeSingle();
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const token = createSessionToken({ id: user.id, provider: 'email', email: user.email, name: user.display_name, avatar: user.avatar_url });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, role: user.role, provider: user.provider } });
  res.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return res;
}
