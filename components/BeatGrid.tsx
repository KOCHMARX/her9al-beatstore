'use client';

import { useEffect, useMemo, useState } from 'react';
import BeatCard, { Beat } from '@/components/BeatCard';
import { Pause, Play, Volume2 } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';

export default function BeatGrid({ compact = false }: { compact?: boolean }) {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [query, setQuery] = useState('');
  const { activeBeat, playing, playBeat, toggle } = usePlayer();

  useEffect(() => {
    fetch('/api/beats')
      .then(r => r.json())
      .then(j => setBeats(j.beats || []));
  }, []);

  const filtered = useMemo(
    () => beats.filter(
      b => b.title.toLowerCase().includes(query.toLowerCase()) ||
        String(b.mood || '').toLowerCase().includes(query.toLowerCase())
    ),
    [beats, query]
  );

  return (
    <>
      {!compact && (
        <div className="filters">
          <input
            placeholder="Search beats, mood..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      )}

      <div className="grid">
        {filtered.slice(0, compact ? 6 : 99).map(b => (
          <BeatCard key={b.id} beat={b} onPlay={playBeat} />
        ))}
        {!filtered.length && (
          <div className="empty-state">No published beats yet. Add your first beat from the Admin panel.</div>
        )}
      </div>

      {activeBeat && (
        <div className="player">
          <img src={activeBeat.cover_url || '/her9al-logo.jpg'} alt="cover" />
          <div className="player-info">
            <strong>{activeBeat.title}</strong>
            <span>Protected preview · master stays private</span>
          </div>
          <div className="controls">
            <button onClick={toggle}>
              {playing ? <Pause /> : <Play fill="currentColor" />}
            </button>
          </div>
          <div className="wave"><span/><span/><span/><span/><span/><span/><span/><span/></div>
          <Volume2 size={18} />
        </div>
      )}
    </>
  );
}
