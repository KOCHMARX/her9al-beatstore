import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import HeroVinyl from '@/components/HeroVinyl';
import BeatGrid from '@/components/BeatGrid';
import { adminDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let latest: any = null;
  try {
    const db = adminDb();
    const { data } = await db
      .from('beats')
      .select('id,title,slug,cover_url,preview_url,published,created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    latest = data || null;
  } catch {}

  return (
    <main>
      <SiteHeader />
      <section className="hero">
        <div className="eyebrow">OFFICIAL PRODUCER STORE</div>
        <h1>BEATS THAT <span>HIT DIFFERENT.</span></h1>
        <p>Original HER9AL beats, clean licensing, private masters and instant re-downloads from your account.</p>
        <div className="cta">
          <Link href="/beats" className="primary">Explore beats</Link>
          <a href="https://www.youtube.com/@her9almusic" className="secondary" target="_blank">YouTube</a>
        </div>
        <HeroVinyl
          title={latest?.title || 'HER9AL // LATEST'}
          cover={latest?.cover_url || '/her9al-logo.jpg'}
          previewUrl={latest?.preview_url || null}
          beatHref={latest?.slug ? `/beats/${latest.slug}` : null}
          beatId={latest?.id || null}
        />
      </section>
      <section className="section">
        <div className="section-head"><div><span>FEATURED</span><h2>Latest drops</h2></div><Link href="/beats">View all</Link></div>
        <BeatGrid compact />
      </section>
      <section id="artist" className="artist">
        <img src="/her9al-logo.jpg" alt="HER9AL" />
        <div><span>ARTIST PROFILE</span><h2>HER9AL</h2><p>Producer · Beatmaker · Independent artist. Music, licensing and your purchased library in one focused place.</p><div className="chips"><b>Dark</b><b>Trap</b><b>Melodic</b><b>Experimental</b></div></div>
      </section>
      <footer>© 2026 HER9AL. All rights reserved.</footer>
    </main>
  );
}
