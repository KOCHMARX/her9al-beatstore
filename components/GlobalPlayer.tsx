'use client';

import Link from 'next/link';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';
import AudioWaveform from '@/components/AudioWaveform';

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

  return (
    <div className="global-player" role="region" aria-label="Music player">
      <Link href={beatHref} className="global-player-track">
        <img src={activeBeat.cover_url || '/her9al-logo.jpg'} alt={activeBeat.title} />
        <div><strong>{activeBeat.title}</strong><span>{activeBeat.genre || 'HER9AL'} · {activeBeat.style || activeBeat.mood || 'Protected preview'}</span></div>
      </Link>
      <button className="global-player-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <span className="player-time current">{formatTime(currentTime)}</span>
      <AudioWaveform src={activeBeat.preview_url} progress={progress} bars={150} className="global-waveform" onSeekRatio={(ratio)=>{ if(duration>0) seek(duration*ratio); }} />
      <span className="player-time">{formatTime(duration)}</span>
      <div className="player-volume">
        <button onClick={() => setVolume(volume > 0 ? 0 : 1)} aria-label={volume > 0 ? 'Mute' : 'Unmute'}>{volume > 0 ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>
        <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e)=>setVolume(Number(e.target.value))}/>
      </div>
    </div>
  );
}
