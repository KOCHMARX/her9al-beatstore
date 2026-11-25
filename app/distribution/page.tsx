import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { PLATFORMS } from '@/lib/distribution';
import { Disc3, UploadCloud, ShieldCheck, BadgeCheck, Globe2, Wallet } from 'lucide-react';

export const metadata = { title: 'HER9AL Distribution — Release your music everywhere' };

const STEPS = [
  ['Create your artist profile', 'Name, bio, country and links. This becomes your artist identity on every store.'],
  ['Upload your release', 'Cover art, WAV/FLAC/MP3 tracks, credits and release date.'],
  ['We review & deliver', 'Our team checks quality and rights, then sends it to the stores.'],
  ['Go live', 'Your release appears on Spotify, Apple Music and more, and you can claim your artist profile.'],
];
const PERKS = [
  [Wallet, 'Free to submit', 'No upfront fees to start your release.'],
  [Globe2, 'All major platforms', 'Spotify, Apple Music, YouTube Music, TikTok and more.'],
  [BadgeCheck, 'Your artist profile', 'Get verified on Spotify for Artists & Apple Music for Artists once live.'],
  [ShieldCheck, 'You keep your rights', 'Your masters stay private and yours.'],
] as const;

export default function Distribution() {
  return (
    <main>
      <SiteHeader />
      <section className="hero dist-hero">
        <div className="eyebrow">HER9AL DISTRIBUTION</div>
        <h1>RELEASE YOUR MUSIC <span>EVERYWHERE.</span></h1>
        <p>Create your artist profile and send your tracks to Spotify, Apple Music, YouTube Music and more — all from one room.</p>
        <div className="cta">
          <Link href="/distribution/studio" className="primary">Start your release</Link>
          <Link href="/beats" className="secondary">Find a beat first</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><div><span>PLATFORMS</span><h2>Where your music goes.</h2></div></div>
        <div className="chips dist-platforms">{PLATFORMS.map(p => <b key={p}>{p}</b>)}</div>
      </section>

      <section className="section dist-tight">
        <div className="section-head"><div><span>WHY HER9AL</span><h2>Built for independent artists.</h2></div></div>
        <div className="dist-grid">
          {PERKS.map(([Icon, t, d]) => (
            <div className="panel dist-card" key={t}><Icon size={22} color="#ff1838" /><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="section dist-tight">
        <div className="section-head"><div><span>HOW IT WORKS</span><h2>Four steps to release day.</h2></div></div>
        <div className="dist-grid">
          {STEPS.map(([t, d], i) => (
            <div className="panel dist-card" key={t}><b className="dist-num">0{i + 1}</b><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
        <div className="cta"><Link href="/distribution/studio" className="primary small"><UploadCloud size={16} /> Open the studio</Link></div>
      </section>
      <footer>© 2026 HER9AL. All rights reserved.</footer>
    </main>
  );
}
