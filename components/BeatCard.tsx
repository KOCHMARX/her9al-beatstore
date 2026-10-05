'use client';

import Link from 'next/link';
import { Play, ArrowUpRight } from 'lucide-react';

export type Beat = {
  id: string;
  slug?: string | null;
  title: string;
  bpm?: number | null;
  musical_key?: string | null;
  mood?: string | null;
  cover_url?: string | null;
  preview_url?: string | null;
  licenses?: { id: string; name: string; price_cents: number; file_format?: string | null }[];
};

export default function BeatCard({ beat, onPlay }: { beat: Beat; onPlay?: (b: Beat) => void }) {
  const lic = beat.licenses?.[0];
  const href = beat.slug ? `/beats/${beat.slug}` : '/beats';

  return (
    <article className="beat-card pro-beat-card">
      <Link href={href} className="beat-cover-link" aria-label={`Open ${beat.title}`}>
        <div className="cover" style={{ backgroundImage: `url(${beat.cover_url || '/her9al-logo.jpg'})` }}>
          <div className="cover-gradient" />
          <button
            type="button"
            className="play"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onPlay?.(beat);
            }}
            disabled={!beat.preview_url}
            aria-label={`Play ${beat.title}`}
          >
            <Play size={18} fill="currentColor" />
          </button>
        </div>
      </Link>

      <div className="beat-meta">
        <div>
          <Link href={href} className="beat-title-link"><h3>{beat.title}</h3></Link>
          <p>{beat.bpm || '—'} BPM · {beat.musical_key || '—'} · {beat.mood || 'HER9AL'}</p>
        </div>
        <Link href={href} className="view-beat-btn">
          {lic ? `$${(lic.price_cents / 100).toFixed(2)}` : 'View'} <ArrowUpRight size={15} />
        </Link>
      </div>
    </article>
  );
}
