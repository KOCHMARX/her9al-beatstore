import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = adminDb();
  const { data, error } = await db.from('order_items')
    .select('id,price_cents,created_at,beat:beats(id,title,cover_url),license:licenses(id,name,file_format,terms),order:orders!inner(id,status,user_id)')
    .eq('order.user_id', u.id).eq('order.status', 'paid').order('created_at', { ascending: false });
  if (error) {
    console.error('HER9AL LIBRARY QUERY ERROR', { code: error.code });
    return NextResponse.json({ error: 'Could not load your library.' }, { status: 500 });
  }
  return NextResponse.json({ items: data || [] });
}
