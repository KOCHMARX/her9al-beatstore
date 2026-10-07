import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { adminDb } from '@/lib/db';
import { hashPassword } from '@/lib/password';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const displayName = String(body.display_name || '').trim().slice(0, 50);

  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  const db = adminDb();
  const { data: existing } = await db.from('app_users').select('id').eq('provider', 'email').eq('email', email).maybeSingle();
  if (existing) return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });

  const ownerEmail = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const { data: user, error } = await db.from('app_users').insert({
    provider: 'email',
    provider_user_id: email,
    email,
    display_name: displayName || email.split('@')[0],
    password_hash: hashPassword(password),
    role: ownerEmail === email ? 'owner' : 'customer',
  }).select('id,email,display_name,avatar_url,role,provider').single();

  if (error || !user) return NextResponse.json({ error: error?.message || 'Could not create account.' }, { status: 400 });

  const token = createSessionToken({ id: user.id, provider: 'email', email: user.email, name: user.display_name, avatar: user.avatar_url });
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return res;
}
