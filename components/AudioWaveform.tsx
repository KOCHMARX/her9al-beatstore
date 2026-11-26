'use client';

import { useEffect, useState } from 'react';
import { waveformFeedback, type WaveformStatus } from '@/lib/waveform-policy';

type Props = {
  src?: string | null;
  progress?: number;
  bars?: number;
  className?: string;
  onSeekRatio?: (ratio: number) => void;
};

const cache = new Map<string, number[]>();

async function buildPeaks(src: string, count: number) {
  const key = `${src}::${count}`;
  if (cache.has(key)) return cache.get(key)!;

  const response = await fetch(src, { cache: 'force-cache' });
  if (!response.ok) throw new Error('Could not load preview for waveform');
  const bytes = await response.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const context = new AudioCtx();
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const channel = decoded.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / count));
    const raw: number[] = [];
    for (let i = 0; i < count; i++) {
      const start = i * block;
      const end = Math.min(channel.length, start + block);
      let peak = 0;
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(channel[j]));
      raw.push(peak);
    }
    const max = Math.max(...raw, 0.001);
    const normalized = raw.map(v => Math.max(0.08, Math.min(1, v / max)));
    cache.set(key, normalized);
    return normalized;
  } finally {
    void context.close();
  }
}

export default function AudioWaveform({ src, progress = 0, bars = 120, className = '', onSeekRatio }: Props) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [status, setStatus] = useState<WaveformStatus>('idle');
  const feedback = waveformFeedback(status, Boolean(peaks));
  const canSeek = Boolean(onSeekRatio) && status === 'ready' && Boolean(peaks);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    if (!src) {
      setStatus('unavailable');
      return;
    }
    setStatus('loading');
    buildPeaks(src, bars)
      .then(next => {
        if (!cancelled) {
          setPeaks(next);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPeaks(null);
          setStatus('unavailable');
        }
      });
    return () => { cancelled = true; };
  }, [src, bars]);

  return (
    <button
      type="button"
      className={`audio-waveform ${className}`.trim()}
      disabled={!canSeek}
      onClick={(e) => {
        if (!canSeek || !onSeekRatio) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeekRatio(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
      }}
      aria-label={feedback ? `Waveform: ${feedback}` : 'Audio waveform'}
    >
      {feedback
        ? <span className="waveform-status" role={status === 'loading' ? 'status' : undefined}>{feedback}</span>
        : peaks?.map((peak, index) => {
            const ratio = index / Math.max(1, peaks.length - 1);
            return <i key={index} className={ratio <= progress ? 'played' : ''} style={{ height: `${Math.round(peak * 92)}%` }} />;
          })}
    </button>
  );
}
