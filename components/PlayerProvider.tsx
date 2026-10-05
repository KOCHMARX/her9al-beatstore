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
  currentTime: number;
  duration: number;
  volume: number;
  playBeat: (beat: GlobalBeat) => Promise<void>;
  toggle: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeBeat, setActiveBeat] = useState<GlobalBeat | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';

    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onTime = () => setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('durationchange', onDuration);

    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('durationchange', onDuration);
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
      setCurrentTime(0);
      setDuration(0);
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

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const next = Math.max(0, Math.min(seconds, Number.isFinite(audio.duration) ? audio.duration : seconds));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const setVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolumeState(next);
    if (audioRef.current) audioRef.current.volume = next;
  };

  return (
    <PlayerContext.Provider value={{ activeBeat, playing, currentTime, duration, volume, playBeat, toggle, pause, seek, setVolume }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
