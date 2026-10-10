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
      <section className="dj-home-section">
        <div className="dj-home-copy">
          <span>ACCOUNT-ONLY EXPERIENCE</span>
          <h2>HER9AL DJ Studio.</h2>
          <p>Mix two tracks in your browser with dual decks, cue points, loops, tempo, EQ, filter, hot cues and a real crossfader. Load HER9AL beats, admin-curated DJ tracks, local audio, or use a SoundCloud embed source.</p>
          <div className="dj-home-actions"><Link className="primary" href="/dj">Open DJ Studio</Link><Link className="secondary" href="/signup">Create account</Link></div>
          <div className="dj-control-chips"><span>PLAY / CUE</span><span>JOG</span><span>LOOPS</span><span>BEAT SYNC</span><span>EQ / CFX</span><span>HOT CUES</span><span>CROSSFADER</span></div>
        </div>
        <div className="dj-home-image"><img src="/dj-controller-reference.png" alt="DJ controller reference"/><div><b>Web DJ controller</b><span>Inspired by a familiar 2-channel DJ workflow, rebuilt for HER9AL.</span></div></div>
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
