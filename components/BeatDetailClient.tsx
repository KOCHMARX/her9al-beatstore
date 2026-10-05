'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Pause, Play, ShoppingBag, ShieldCheck, Download, Music2 } from 'lucide-react';

export default function BeatDetailClient({ beat }: { beat: any }) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const licenses = (beat.licenses || []).filter((l: any) => l.active !== false);

  const toggle = async () => {
    if (!audio.current || !beat.preview_url) return;
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      try { await audio.current.play(); setPlaying(true); } catch {}
    }
  };

  return (
    <section className="beat-detail-shell">
      <div className="beat-detail-cover-wrap">
        <div className="beat-detail-cover" style={{ backgroundImage: `url(${beat.cover_url || '/her9al-logo.jpg'})` }}>
          <button className="detail-play" onClick={toggle} disabled={!beat.preview_url}>
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </button>
        </div>
        {beat.preview_url && <audio ref={audio} src={beat.preview_url} preload="metadata" onEnded={() => setPlaying(false)} />}
      </div>

      <div className="beat-detail-content">
        <span className="detail-kicker">HER9AL ORIGINAL</span>
        <h1>{beat.title}</h1>
        <div className="detail-tags">
          <span>{beat.bpm || '—'} BPM</span>
          <span>{beat.musical_key || '—'}</span>
          <span>{beat.mood || 'HER9AL'}</span>
        </div>
        <p className="detail-copy">Preview the beat, choose your license and keep every paid purchase inside your HER9AL account for future downloads.</p>

        <div className="license-list">
          {licenses.map((lic: any) => (
            <div className="license-card" key={lic.id}>
              <div>
                <div className="license-name"><ShieldCheck size={18} /> {lic.name}</div>
                <p>{lic.file_format || 'WAV + MP3'} · Secure delivery after payment</p>
              </div>
              <div className="license-action">
                <strong>${(lic.price_cents / 100).toFixed(2)}</strong>
                <Link href={`/checkout/${lic.id}`} className="primary detail-buy"><ShoppingBag size={17} /> Buy</Link>
              </div>
            </div>
          ))}
          {!licenses.length && <div className="empty-state">No active license is available for this beat yet.</div>}
        </div>

        <div className="detail-benefits">
          <span><Music2 size={16} /> Full beat details</span>
          <span><Download size={16} /> Re-download from your library</span>
          <span><ShieldCheck size={16} /> Private master delivery</span>
        </div>
      </div>
    </section>
  );
}
