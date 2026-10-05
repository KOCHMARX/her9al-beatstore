'use client';

import Link from 'next/link';
import { Play, Pause } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Props = {
  title?: string;
  cover?: string;
  previewUrl?: string | null;
  beatHref?: string | null;
};

export default function HeroVinyl({
  title = 'HER9AL',
  cover = '/her9al-logo.jpg',
  previewUrl,
  beatHref,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setPlaying(false);
  }, [previewUrl]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !previewUrl) {
      setPlaying(v => !v);
      return;
    }
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  };

  const inner = (
    <>
      <div className={`vinyl ${playing ? 'is-spinning' : ''}`}>
        <div className="vinyl-rings" />
        <div className="vinyl-label" style={{ backgroundImage: `url(${cover})` }} />
        <div className="vinyl-hole" />
      </div>
      <div className="vinyl-shadow" />
    </>
  );

  return (
    <div className="vinyl-stage" aria-label={`${title} featured beat`}>
      {beatHref ? <Link href={beatHref} className="vinyl-link">{inner}</Link> : inner}
      <button className="vinyl-toggle" onClick={toggle} aria-label={playing ? 'Pause preview' : 'Play preview'}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <div className="vinyl-caption">
        <span>FEATURED DROP</span>
        {beatHref ? <Link href={beatHref}><strong>{title}</strong></Link> : <strong>{title}</strong>}
      </div>
      {previewUrl && <audio ref={audioRef} src={previewUrl} preload="metadata" onEnded={() => setPlaying(false)} />}
    </div>
  );
}
