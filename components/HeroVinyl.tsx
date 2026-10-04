'use client';

import { Play, Pause } from 'lucide-react';
import { useState } from 'react';

type Props = {
  title?: string;
  cover?: string;
};

export default function HeroVinyl({ title = 'HER9AL', cover = '/her9al-logo.jpg' }: Props) {
  const [playing, setPlaying] = useState(true);

  return (
    <div className="vinyl-stage" aria-label={`${title} featured beat`}>
      <div className={`vinyl ${playing ? 'is-spinning' : ''}`}>
        <div className="vinyl-rings" />
        <div className="vinyl-label" style={{ backgroundImage: `url(${cover})` }} />
        <div className="vinyl-hole" />
      </div>
      <div className="vinyl-shadow" />
      <button className="vinyl-toggle" onClick={() => setPlaying(v => !v)} aria-label={playing ? 'Pause vinyl animation' : 'Play vinyl animation'}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <div className="vinyl-caption">
        <span>FEATURED DROP</span>
        <strong>{title}</strong>
      </div>
    </div>
  );
}
