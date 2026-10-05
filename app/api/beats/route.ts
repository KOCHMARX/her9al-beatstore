import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = adminDb();
    const { data, error } = await db
      .from('beats')
      .select('id,title,slug,bpm,musical_key,mood,cover_url,preview_url,published,created_at,album_id,licenses(id,name,price_cents,file_format,is_exclusive)')
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ beats: data || [] });
  } catch (error: any) {
    console.error('HER9AL PUBLIC BEATS ERROR:', error);
    return NextResponse.json({ error: error?.message || 'catalog_failed' }, { status: 500 });
  }
}
