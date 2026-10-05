'use client';

import Link from 'next/link';
import { Play, Pause } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';

type Props = {
  title?: string;
  cover?: string;
  previewUrl?: string | null;
  beatHref?: string | null;
  beatId?: string | null;
};

export default function HeroVinyl({
  title = 'HER9AL // LATEST',
  cover = '/her9al-logo.jpg',
  previewUrl,
  beatHref,
  beatId,
}: Props) {
  const { activeBeat, playing, playBeat, toggle } = usePlayer();

  // Important: on a hard refresh the global player starts empty,
  // so the vinyl returns to the HER9AL artwork. Once a beat is played,
  // its cover becomes the vinyl label until another beat is selected.
  const shownBeat = activeBeat;
  const shownCover = shownBeat?.cover_url || '/her9al-logo.jpg';
  const shownTitle = shownBeat?.title || 'HER9AL // LATEST';
  const shownHref = shownBeat?.slug ? `/beats/${shownBeat.slug}` : null;

  const toggleHero = async () => {
    if (activeBeat) {
      await toggle();
      return;
    }
    if (previewUrl && beatId) {
      await playBeat({
        id: beatId,
        slug: beatHref?.split('/').filter(Boolean).pop() || null,
        title,
        cover_url: cover,
        preview_url: previewUrl,
      });
    }
  };

  const inner = (
    <>
      <div className={`vinyl ${playing ? 'is-spinning' : ''}`}>
        <div className="vinyl-rings" />
        <div className="vinyl-label" style={{ backgroundImage: `url(${shownCover})` }} />
        <div className="vinyl-hole" />
      </div>
      <div className="vinyl-shadow" />
    </>
  );

  return (
    <div className="vinyl-stage" aria-label={`${shownTitle} featured beat`}>
      {shownHref ? <Link href={shownHref} className="vinyl-link">{inner}</Link> : inner}
      <button className="vinyl-toggle" onClick={toggleHero} aria-label={playing ? 'Pause preview' : 'Play preview'}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <div className="vinyl-caption">
        <span>FEATURED DROP</span>
        {shownHref ? <Link href={shownHref}><strong>{shownTitle}</strong></Link> : <strong>{shownTitle}</strong>}
      </div>
    </div>
  );
}
