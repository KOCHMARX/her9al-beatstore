import Link from 'next/link';
import BeatCard from '@/components/BeatCard';
import AudioPlayer from '@/components/AudioPlayer';
import HeroVinyl from '@/components/HeroVinyl';

const beats=[
  {id:'1',title:'NOIR',bpm:142,keyName:'F#m',mood:'Dark',price:29.99},
  {id:'2',title:'REDLINE',bpm:150,keyName:'Dm',mood:'Aggressive',price:39.99},
  {id:'3',title:'AFTER 2AM',bpm:128,keyName:'Am',mood:'Melodic',price:24.99}
];

export default function Home(){
 return <main>
  <nav className="nav"><Link href="/" className="brand"><img src="/her9al-logo.jpg"/><span>HER9AL</span></Link><div className="navlinks"><Link href="/beats">Beats</Link><Link href="#artist">Artist</Link><Link href="/login">Login</Link><Link className="admin-link" href="/admin">Admin</Link></div></nav>
  <section className="hero">
    <div className="eyebrow">OFFICIAL PRODUCER STORE</div>
    <h1>BEATS THAT <span>HIT DIFFERENT.</span></h1>
    <p>Original beats, clean licensing, instant delivery. Built around the HER9AL sound.</p>
    <div className="cta"><Link href="/beats" className="primary">Explore beats</Link><a href="https://www.youtube.com/@her9almusic" className="secondary">YouTube</a></div>
    <HeroVinyl title="HER9AL // LATEST" cover="/her9al-logo.jpg"/>
  </section>
  <section className="section"><div className="section-head"><div><span>FEATURED</span><h2>Latest drops</h2></div><Link href="/beats">View all</Link></div><div className="grid">{beats.map(b=><BeatCard key={b.id} beat={b}/>)}</div></section>
  <section id="artist" className="artist"><img src="/her9al-logo.jpg"/><div><span>ARTIST PROFILE</span><h2>HER9AL</h2><p>Producer · Beatmaker · Independent artist. A focused space for music, beats and licensing — without the clutter.</p><div className="chips"><b>Dark</b><b>Trap</b><b>Melodic</b><b>Experimental</b></div></div></section>
  <footer>© 2026 HER9AL. All rights reserved.</footer>
  <AudioPlayer/>
 </main>
}
