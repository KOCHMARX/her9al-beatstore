import { NextRequest, NextResponse } from 'next/server';
import { currentUser, isStaff } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { STATUSES, clean, cleanUrl, Track } from '@/lib/distribution';
import { buildDeliveryPackage } from '@/lib/distributor';

export const runtime = 'nodejs';

export async function GET() {
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const db = adminDb();
  const { data, error } = await db.from('releases').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = [];
  for (const r of data || []) {
    const { data: artist } = await db.from('artist_profiles').select('*').eq('user_id', r.user_id).maybeSingle();
    const files = [];
    for (const t of (r.tracks || []) as Track[]) {
      const { data: s } = await db.storage.from('release-audio').createSignedUrl(t.audio_path, 3600);
      files.push({ title: t.title, url: s?.signedUrl || null });
    }
    out.push({ ...r, artist, files, package: buildDeliveryPackage(r, artist) });
  }
  return NextResponse.json({ releases: out });
}

export async function PATCH(req: NextRequest) {
  const u = await currentUser();
  if (!isStaff(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id || !STATUSES.includes(b.status)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const links = b.store_links || {};
  const patch = {
    status: b.status, admin_note: clean(b.admin_note, 600), upc: clean(b.upc, 20),
    store_links: { spotify: cleanUrl(links.spotify), apple: cleanUrl(links.apple), youtube: cleanUrl(links.youtube) },
    updated_at: new Date().toISOString(),
  };
  const { error } = await adminDb().from('releases').update(patch).eq('id', b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
