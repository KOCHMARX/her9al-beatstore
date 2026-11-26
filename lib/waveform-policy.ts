// Waveform copy must never imply that generated bars represent real audio.
export type WaveformStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export function waveformFeedback(status: WaveformStatus, hasPeaks: boolean): string | null {
  if (status === 'loading') return 'Loading waveform…';
  if (status === 'ready' && hasPeaks) return null;
  return 'Preview waveform unavailable';
}
