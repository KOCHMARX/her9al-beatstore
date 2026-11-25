import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import HeroVinyl from '@/components/HeroVinyl';
import BeatGrid from '@/components/BeatGrid';
import { adminDb } from '@/lib/db';
import { COLLABORATORS } from '@/lib/collaborators';

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
      <section id="rappers" className="rappers-section">
        <div className="rappers-head">
          <span>COLLABORATIONS</span>
          <h2>Rappers I worked with.</h2>
          <p>This section is reserved for real artists and rappers you have worked with — credits, releases and links in one place.</p>
        </div>
        {COLLABORATORS.length ? (
          <div className="rappers-grid">
            {COLLABORATORS.map((artist) => {
              const card = <>
                <img src={artist.image || '/her9al-logo.jpg'} alt={artist.name} />
                <div><strong>{artist.name}</strong><span>{artist.note || 'HER9AL collaboration'}</span></div>
              </>;
              return artist.link ? <a className="rapper-card" href={artist.link} target="_blank" rel="noreferrer" key={artist.name}>{card}</a> : <div className="rapper-card" key={artist.name}>{card}</div>;
            })}
          </div>
        ) : (
          <div className="rappers-empty">Your collaboration cards will appear here when you add the rappers you worked with.</div>
        )}
      </section>
      <footer>© 2026 HER9AL. All rights reserved.</footer>
    </main>
  );
}
