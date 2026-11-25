import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { PLATFORMS } from '@/lib/distribution';
import { Disc3, UploadCloud, ShieldCheck, BadgeCheck, Globe2, Wallet } from 'lucide-react';

export const metadata = { title: 'HER9AL Distribution — Release your music everywhere' };

const STEPS = [
  ['Create your artist profile', 'Name, bio, country and links. This becomes your artist identity on every store.'],
  ['Upload your release', 'Cover art, WAV/FLAC/MP3 tracks, credits and release date.'],
  ['We review & prepare', 'Our team checks quality and rights, then prepares approved releases for licensed-distributor delivery.'],
  ['Track delivery', 'Follow the status here. A release is only marked delivered or live after the team confirms the real distributor workflow.'],
];
const PERKS = [
  [Wallet, 'Free to submit', 'No upfront fees to start your release.'],
  [Globe2, 'Platform selection', 'Request major platforms; final availability depends on the licensed distributor and each store.'],
  [BadgeCheck, 'Your artist profile', 'Once eligible and live, use each platform’s official process to claim your artist profile.'],
  [ShieldCheck, 'You keep your rights', 'Your masters stay private and yours.'],
] as const;

export default function Distribution() {
  return (
    <main>
      <SiteHeader />
      <section className="hero dist-hero">
        <div className="eyebrow">HER9AL DISTRIBUTION</div>
        <h1>RELEASE YOUR MUSIC <span>EVERYWHERE.</span></h1>
        <p>Create your artist profile, submit release-ready tracks, and manage the review workflow for Spotify, Apple Music, YouTube Music and more.</p>
        <div className="cta">
          <Link href="/distribution/studio" className="primary">Start your release</Link>
          <Link href="/beats" className="secondary">Find a beat first</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><div><span>PLATFORMS</span><h2>Where you can request delivery.</h2></div></div>
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
        <div className="panel dist-disclaimer"><ShieldCheck size={20} color="#ff1838" /><div><strong>Transparent delivery workflow</strong><p>HER9AL currently prepares releases for manual delivery through a licensed distributor. This website does not automatically upload to Spotify, Apple Music, or other stores, and submission does not guarantee acceptance.</p></div></div>
      </section>
      <footer>© 2026 HER9AL. All rights reserved.</footer>
    </main>
  );
}
