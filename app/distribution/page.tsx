import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { PLATFORMS } from '@/lib/distribution';
import { UploadCloud, ShieldCheck, BadgeCheck, Globe2, Wallet } from 'lucide-react';

export const metadata = { title: 'HER9AL Distribution — Get your release ready' };

const STEPS = [
  ['Create your artist profile', 'Name, bio, country and links for the delivery package.'],
  ['Upload your release', 'Cover art, WAV/FLAC/MP3 tracks, credits and release date.'],
  ['We review & prepare', 'Our team checks quality and rights, then prepares approved releases for licensed-distributor delivery.'],
  ['Track the workflow', 'Follow the status here. Delivery and live labels are only used after the team confirms real distribution.'],
];
const PERKS = [
  [Wallet, 'Submit for review', 'Prepare a submission without promising a release date.'],
  [Globe2, 'Requested platforms', 'Choose the platforms you want us to request; availability depends on the licensed distributor and each store.'],
  [BadgeCheck, 'Your artist profile', 'After confirmed delivery, use each platform’s official process to claim your artist profile.'],
  [ShieldCheck, 'You keep your rights', 'Your masters stay private and yours.'],
] as const;

export default function Distribution() {
  return (
    <main>
      <SiteHeader />
      <section className="hero dist-hero">
        <div className="eyebrow">HER9AL DISTRIBUTION</div>
        <h1>GET YOUR RELEASE <span>READY.</span></h1>
        <p>Create your artist profile, submit your tracks for review and prepare a delivery package. Delivery to Spotify, Apple Music, YouTube Music and other stores happens through an authorized distributor and is only confirmed once it has actually been delivered.</p>
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
            <div className="panel dist-card" key={t}><Icon size={22} className="dist-card-icon" /><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="section dist-tight">
        <div className="section-head"><div><span>HOW IT WORKS</span><h2>Four steps to prepare your release.</h2></div></div>
        <div className="dist-grid">
          {STEPS.map(([t, d], i) => (
            <div className="panel dist-card" key={t}><b className="dist-num">0{i + 1}</b><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
        <div className="cta"><Link href="/distribution/studio" className="primary small"><UploadCloud size={16} /> Open the studio</Link></div>
        <div className="panel dist-disclaimer"><ShieldCheck size={20} className="dist-card-icon" /><div><strong>Transparent delivery workflow</strong><p>HER9AL currently prepares releases for manual delivery through a licensed distributor. This website does not automatically upload to Spotify, Apple Music, or other stores, and submission does not guarantee acceptance.</p></div></div>
      </section>
      <footer>© 2026 HER9AL. All rights reserved.</footer>
    </main>
  );
}
