'use client';

import Link from 'next/link';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function GlobalPlayer() {
  const { activeBeat, playing, currentTime, duration, volume, toggle, seek, setVolume } = usePlayer();
  if (!activeBeat) return null;

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const beatHref = activeBeat.slug ? `/beats/${activeBeat.slug}` : '/beats';
  const bars = Array.from({ length: 108 }, (_, i) => 22 + ((i * 47 + 19) % 74));

  return (
    <div className="global-player" role="region" aria-label="Music player">
      <Link href={beatHref} className="global-player-track">
        <img src={activeBeat.cover_url || '/her9al-logo.jpg'} alt={activeBeat.title} />
        <div>
          <strong>{activeBeat.title}</strong>
          <span>{activeBeat.genre || 'HER9AL'} · {activeBeat.style || activeBeat.mood || 'Protected preview'}</span>
        </div>
      </Link>

      <button className="global-player-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>

      <span className="player-time current">{formatTime(currentTime)}</span>

      <button
        className="player-wave"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (duration > 0) seek(duration * ratio);
        }}
        aria-label="Seek through beat"
      >
        <span className="player-wave-progress" style={{ width: `${progress * 100}%` }} />
        <span className="player-wave-bars">
          {bars.map((height, index) => {
            const played = index / bars.length <= progress;
            return <i key={index} className={played ? 'played' : ''} style={{ height: `${height}%` }} />;
          })}
        </span>
      </button>

      <span className="player-time">{formatTime(duration)}</span>

      <div className="player-volume">
        <button onClick={() => setVolume(volume > 0 ? 0 : 1)} aria-label={volume > 0 ? 'Mute' : 'Unmute'}>
          {volume > 0 ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <input
          aria-label="Volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
