import { notFound } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import BeatDetailClient from '@/components/BeatDetailClient';
import { adminDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function BeatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = adminDb();
  const { data, error } = await db.from('beats')
    .select('id,title,slug,bpm,musical_key,mood,genre,style,description,cover_url,preview_url,published,created_at,album_id,albums(id,title,cover_url,published),licenses(id,name,price_cents,file_format,is_exclusive,terms,active,beat_id)')
    .eq('slug', slug).eq('published', true).maybeSingle();

  if (error) {
    console.error('HER9AL BEAT DETAIL QUERY ERROR', { code: error.code });
    return <main><SiteHeader /><section className="section page"><div className="empty-state" role="alert">This beat could not be loaded right now. Please try again shortly.</div></section></main>;
  }
  if (!data) notFound();

  const beat = { ...data, albums: (data as any).albums?.published === false ? null : (data as any).albums };
  return <main><SiteHeader /><BeatDetailClient beat={beat} /></main>;
}
