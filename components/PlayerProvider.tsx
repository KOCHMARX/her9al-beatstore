'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

export type GlobalBeat = {
  id: string;
  slug?: string | null;
  title: string;
  cover_url?: string | null;
  preview_url?: string | null;
  bpm?: number | null;
  musical_key?: string | null;
  mood?: string | null;
  genre?: string | null;
  style?: string | null;
  description?: string | null;
  albums?: { id: string; title: string; cover_url?: string | null } | null;
  licenses?: { id: string; name: string; price_cents: number; file_format?: string | null }[];
};

type PlayerContextValue = {
  activeBeat: GlobalBeat | null;
  playing: boolean;
  playBeat: (beat: GlobalBeat) => Promise<void>;
  toggle: () => Promise<void>;
  pause: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeBeat, setActiveBeat] = useState<GlobalBeat | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.addEventListener('ended', () => setPlaying(false));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('play', () => setPlaying(true));
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  const playBeat = async (beat: GlobalBeat) => {
    const audio = audioRef.current;
    if (!audio || !beat.preview_url) return;

    const sameBeat = activeBeat?.id === beat.id;
    if (!sameBeat) {
      audio.pause();
      audio.src = beat.preview_url;
      audio.currentTime = 0;
      setActiveBeat(beat);
    }

    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !activeBeat?.preview_url) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const pause = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  return (
    <PlayerContext.Provider value={{ activeBeat, playing, playBeat, toggle, pause }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
