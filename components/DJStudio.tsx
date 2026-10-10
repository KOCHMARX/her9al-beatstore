'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Music2, Search, Settings2, SlidersHorizontal, Upload } from 'lucide-react';

type DJTrack = {
  id: string;
  title: string;
  artist?: string | null;
  audio_url?: string | null;
  cover_url?: string | null;
  soundcloud_url?: string | null;
  bpm?: number | null;
  source_type?: string | null;
  meta?: string | null;
};

type DeckState = {
  track: DJTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  bpm: number;
  tempo: number;
  cue: number;
  loopIn: number | null;
  loopOut: number | null;
  loop: boolean;
  peaks: number[];
};

const emptyDeck = (): DeckState => ({
  track: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  bpm: 120,
  tempo: 0,
  cue: 0,
  loopIn: null,
  loopOut: null,
  loop: false,
  peaks: Array.from({ length: 110 }, (_, i) => 0.18 + ((i * 37) % 70) / 100),
});

function fmt(n: number) {
  if (!Number.isFinite(n)) return '0:00';
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function TopDeck({ side, deck, onSeek }: { side: 'A' | 'B'; deck: DeckState; onSeek: (ratio: number) => void }) {
  const progress = deck.duration ? deck.currentTime / deck.duration : 0;
  return (
    <section className={`tribe-top-deck tribe-top-${side.toLowerCase()}`}>
      <div className="tribe-track-meta">
        <div>
          <strong>{deck.track?.title || (side === 'A' ? 'Deck A' : 'Deck B')}</strong>
          <span>{deck.track?.artist || 'HER9AL DJ'}</span>
        </div>
        <div className="tribe-bpm-pill">{Math.round(deck.bpm)} BPM</div>
        <div className="tribe-time-copy">{fmt(deck.currentTime)} / {fmt(deck.duration)}</div>
      </div>
      <button
        className="tribe-wave-strip"
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek((e.clientX - r.left) / r.width);
        }}
      >
        {deck.peaks.map((p, i) => (
          <i key={i} className={i / deck.peaks.length <= progress ? 'played' : ''} style={{ height: `${Math.max(10, p * 100)}%` }} />
        ))}
        <span className="tribe-wave-cursor" style={{ left: `${progress * 100}%` }} />
      </button>
    </section>
  );
}

export default function DJStudio() {
  const [userOk, setUserOk] = useState<boolean | null>(null);
  const [library, setLibrary] = useState<DJTrack[]>([]);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'library' | 'settings' | null>(null);
  const [deckA, setDeckA] = useState<DeckState>(emptyDeck());
  const [deckB, setDeckB] = useState<DeckState>(emptyDeck());
  const [cross, setCross] = useState(0);
  const [master, setMaster] = useState(0.9);
  const [eqA, setEqA] = useState({ trim: .9, hi: 0, mid: 0, low: 0, filter: 0, channel: .9 });
  const [eqB, setEqB] = useState({ trim: .9, hi: 0, mid: 0, low: 0, filter: 0, channel: .9 });
  const audioA = useRef<HTMLAudioElement | null>(null);
  const audioB = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodes = useRef<any>({});

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!j.user) { location.href = '/login?next=/dj'; return; }
        setUserOk(true);
      })
      .catch(() => location.href = '/login?next=/dj');
    fetch('/api/dj/library', { cache: 'no-store' })
      .then(async r => { if (r.ok) setLibrary((await r.json()).tracks || []); })
      .catch(() => {});
  }, []);

  const setupAudio = (audio: HTMLAudioElement, key: 'A' | 'B') => {
    if (nodes.current[key]) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = ctxRef.current || (ctxRef.current = new Ctx());
    const src = ctx.createMediaElementSource(audio);
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 250;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = .8;
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 22000;
    const gain = ctx.createGain();
    src.connect(low).connect(mid).connect(high).connect(filter).connect(gain).connect(ctx.destination);
    nodes.current[key] = { low, mid, high, filter, gain };
  };

  const bindAudio = (audio: HTMLAudioElement | null, key: 'A' | 'B', setDeck: React.Dispatch<React.SetStateAction<DeckState>>) => {
    if (!audio) return;
    setupAudio(audio, key);
    const tick = () => setDeck(x => ({ ...x, currentTime: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : x.duration }));
    audio.ontimeupdate = tick;
    audio.onloadedmetadata = tick;
    audio.ondurationchange = tick;
    audio.onplay = () => setDeck(x => ({ ...x, playing: true }));
    audio.onpause = () => setDeck(x => ({ ...x, playing: false }));
    audio.onended = () => setDeck(x => ({ ...x, playing: false }));
  };

  useEffect(() => { bindAudio(audioA.current, 'A', setDeckA); bindAudio(audioB.current, 'B', setDeckB); }, []);

  const peaksFromUrl = async (url: string) => {
    try {
      const ctx = ctxRef.current || new AudioContext();
      const buf = await fetch(url).then(r => r.arrayBuffer());
      const dec = await ctx.decodeAudioData(buf.slice(0));
      const data = dec.getChannelData(0);
      const bins = 110;
      const step = Math.max(1, Math.floor(data.length / bins));
      return Array.from({ length: bins }, (_, i) => {
        let m = 0;
        for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += Math.max(1, Math.floor(step / 100))) m = Math.max(m, Math.abs(data[j]));
        return Math.max(.08, m);
      });
    } catch {
      return Array.from({ length: 110 }, (_, i) => .2 + ((i * 37) % 60) / 100);
    }
  };

  const loadTrack = async (side: 'A' | 'B', track: DJTrack) => {
    if (!track.audio_url) {
      if (track.soundcloud_url) window.open(track.soundcloud_url, '_blank', 'noopener,noreferrer');
      return;
    }
    const audio = side === 'A' ? audioA.current : audioB.current;
    const setDeck = side === 'A' ? setDeckA : setDeckB;
    if (!audio) return;
    audio.pause();
    audio.src = track.audio_url;
    audio.load();
    const peaks = await peaksFromUrl(track.audio_url);
    setDeck({ ...emptyDeck(), track, bpm: Number(track.bpm) || 120, peaks });
  };

  const loadLocal = async (side: 'A' | 'B', file: File) => {
    const url = URL.createObjectURL(file);
    await loadTrack(side, { id: `local:${Date.now()}`, title: file.name.replace(/\.[^.]+$/, ''), artist: 'Local file', audio_url: url, cover_url: '/her9al-logo.jpg', source_type: 'local' });
  };

  const seek = (side: 'A' | 'B', ratio: number) => {
    const a = side === 'A' ? audioA.current : audioB.current;
    if (!a || !Number.isFinite(a.duration)) return;
    a.currentTime = Math.max(0, Math.min(a.duration, ratio * a.duration));
  };

  const toggle = async (side: 'A' | 'B') => {
    const a = side === 'A' ? audioA.current : audioB.current;
    const d = side === 'A' ? deckA : deckB;
    if (!a || !d.track?.audio_url) return;
    if (a.paused) { try { await a.play(); } catch {} } else a.pause();
  };

  const cue = (side: 'A' | 'B') => {
    const a = side === 'A' ? audioA.current : audioB.current;
    const d = side === 'A' ? deckA : deckB;
    if (!a) return;
    a.pause();
    a.currentTime = d.cue || 0;
  };

  const setCue = (side: 'A' | 'B') => {
    const a = side === 'A' ? audioA.current : audioB.current;
    const set = side === 'A' ? setDeckA : setDeckB;
    if (a) set(x => ({ ...x, cue: a.currentTime || 0 }));
  };

  const sync = (side: 'A' | 'B') => {
    const src = side === 'A' ? deckB : deckA;
    const target = side === 'A' ? deckA : deckB;
    const set = side === 'A' ? setDeckA : setDeckB;
    if (!src.bpm || !target.bpm) return;
    set(x => ({ ...x, tempo: Math.max(-16, Math.min(16, ((src.bpm / target.bpm) - 1) * 100)) }));
  };

  const fourBeatLoop = (side: 'A' | 'B') => {
    const a = side === 'A' ? audioA.current : audioB.current;
    const d = side === 'A' ? deckA : deckB;
    const set = side === 'A' ? setDeckA : setDeckB;
    if (!a) return;
    const len = 60 / (d.bpm || 120) * 4;
    set(x => ({ ...x, loopIn: a.currentTime, loopOut: a.currentTime + len, loop: true }));
  };

  useEffect(() => {
    const apply = (key: 'A' | 'B', d: DeckState, eq: typeof eqA, audio: HTMLAudioElement | null) => {
      const n = nodes.current[key]; if (!n || !audio) return;
      audio.playbackRate = Math.max(.5, Math.min(1.5, 1 + d.tempo / 100));
      n.low.gain.value = eq.low * 12; n.mid.gain.value = eq.mid * 12; n.high.gain.value = eq.hi * 12;
      const f = Math.abs(eq.filter);
      n.filter.type = eq.filter < 0 ? 'lowpass' : 'highpass';
      n.filter.frequency.value = f < .03 ? 22000 : (eq.filter < 0 ? 22000 - (f * 20500) : 30 + (f * 12000));
    };
    apply('A', deckA, eqA, audioA.current);
    apply('B', deckB, eqB, audioB.current);
  }, [deckA.tempo, deckB.tempo, eqA, eqB]);

  useEffect(() => {
    const ga = nodes.current.A?.gain, gb = nodes.current.B?.gain;
    if (!ga || !gb) return;
    const left = Math.cos((cross + 1) * Math.PI / 4), right = Math.sin((cross + 1) * Math.PI / 4);
    ga.gain.value = eqA.channel * eqA.trim * master * left;
    gb.gain.value = eqB.channel * eqB.trim * master * right;
  }, [cross, master, eqA.channel, eqA.trim, eqB.channel, eqB.trim]);

  useEffect(() => {
    const id = setInterval(() => {
      const loop = (a: HTMLAudioElement | null, d: DeckState) => {
        if (a && d.loop && d.loopIn !== null && d.loopOut !== null && a.currentTime >= d.loopOut) a.currentTime = d.loopIn;
      };
      loop(audioA.current, deckA); loop(audioB.current, deckB);
    }, 30);
    return () => clearInterval(id);
  }, [deckA, deckB]);

  const filtered = useMemo(() => library.filter(t => `${t.title} ${t.artist || ''} ${t.meta || ''}`.toLowerCase().includes(query.toLowerCase())), [library, query]);
  if (userOk === null) return <div className="dj-loading">Loading DJ Studio…</div>;

  const knob = (side: 'A' | 'B', key: 'trim' | 'hi' | 'mid' | 'low' | 'filter') => {
    const value = side === 'A' ? eqA[key] : eqB[key];
    const setter = side === 'A' ? setEqA : setEqB;
    const min = key === 'trim' ? 0 : -1, max = key === 'trim' ? 1.4 : 1;
    return <input aria-label={`${side} ${key}`} className={`flx4-range flx4-${side.toLowerCase()}-${key}`} type="range" min={min} max={max} step="0.01" value={value} onChange={e => setter(x => ({ ...x, [key]: Number(e.target.value) }))} />;
  };

  return (
    <div className="tribe-dj-page">
      <audio ref={r => { audioA.current = r; if (r) bindAudio(r, 'A', setDeckA); }} crossOrigin="anonymous" />
      <audio ref={r => { audioB.current = r; if (r) bindAudio(r, 'B', setDeckB); }} crossOrigin="anonymous" />

      <div className="tribe-wave-header">
        <TopDeck side="A" deck={deckA} onSeek={r => seek('A', r)} />
        <div className="tribe-master-wave">
          <div className="tribe-master-wave-grid">
            {[...deckA.peaks, ...deckB.peaks].slice(0, 150).map((p, i) => <i key={i} style={{ height: `${Math.max(15, p * 100)}%` }} />)}
          </div>
        </div>
        <TopDeck side="B" deck={deckB} onSeek={r => seek('B', r)} />
      </div>

      <div className="tribe-studio-bar"><span>← HER9AL</span><b>STUDIO</b><span>ACCOUNT MODE</span></div>

      <main className="tribe-stage">
        <div className="flx4-shell">
          <img src="/dj-controller-reference.png" alt="DDJ-style controller" className="flx4-image" />

          <button className="flx4-hot flx4-play-a" title="Play/Pause Deck A" onClick={() => toggle('A')} />
          <button className="flx4-hot flx4-cue-a" title="Cue Deck A" onClick={() => cue('A')} onDoubleClick={() => setCue('A')} />
          <button className="flx4-hot flx4-sync-a" title="Beat Sync A" onClick={() => sync('A')} />
          <button className="flx4-hot flx4-loop-a" title="4 Beat Loop A" onClick={() => fourBeatLoop('A')} />
          <button className="flx4-hot flx4-play-b" title="Play/Pause Deck B" onClick={() => toggle('B')} />
          <button className="flx4-hot flx4-cue-b" title="Cue Deck B" onClick={() => cue('B')} onDoubleClick={() => setCue('B')} />
          <button className="flx4-hot flx4-sync-b" title="Beat Sync B" onClick={() => sync('B')} />
          <button className="flx4-hot flx4-loop-b" title="4 Beat Loop B" onClick={() => fourBeatLoop('B')} />

          <label className="flx4-file flx4-file-a" title="Load local file to Deck A"><Upload size={15}/><input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && loadLocal('A', e.target.files[0])} /></label>
          <label className="flx4-file flx4-file-b" title="Load local file to Deck B"><Upload size={15}/><input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && loadLocal('B', e.target.files[0])} /></label>

          {knob('A','trim')}{knob('A','hi')}{knob('A','mid')}{knob('A','low')}{knob('A','filter')}
          {knob('B','trim')}{knob('B','hi')}{knob('B','mid')}{knob('B','low')}{knob('B','filter')}

          <input className="flx4-slider flx4-tempo-a" aria-label="Tempo A" type="range" min="-16" max="16" step="0.1" value={deckA.tempo} onChange={e => setDeckA(x => ({ ...x, tempo: Number(e.target.value) }))} />
          <input className="flx4-slider flx4-tempo-b" aria-label="Tempo B" type="range" min="-16" max="16" step="0.1" value={deckB.tempo} onChange={e => setDeckB(x => ({ ...x, tempo: Number(e.target.value) }))} />
          <input className="flx4-fader flx4-fader-a" aria-label="Channel A" type="range" min="0" max="1" step="0.01" value={eqA.channel} onChange={e => setEqA(x => ({ ...x, channel: Number(e.target.value) }))} />
          <input className="flx4-fader flx4-fader-b" aria-label="Channel B" type="range" min="0" max="1" step="0.01" value={eqB.channel} onChange={e => setEqB(x => ({ ...x, channel: Number(e.target.value) }))} />
          <input className="flx4-cross" aria-label="Crossfader" type="range" min="-1" max="1" step="0.01" value={cross} onChange={e => setCross(Number(e.target.value))} />
          <input className="flx4-master" aria-label="Master volume" type="range" min="0" max="1" step="0.01" value={master} onChange={e => setMaster(Number(e.target.value))} />
        </div>
      </main>

      <nav className="tribe-dock">
        <button className={panel === 'library' ? 'active' : ''} onClick={() => setPanel(panel === 'library' ? null : 'library')}><Music2 size={15}/> Music Library</button>
        <button className="active"><SlidersHorizontal size={15}/> DDJ-FLX4</button>
        <button className={panel === 'settings' ? 'active' : ''} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><Settings2 size={15}/> Settings</button>
      </nav>

      {panel === 'library' && (
        <section className="tribe-drawer">
          <div className="tribe-drawer-head"><div><FolderOpen/><b>Music Library</b></div><button onClick={() => setPanel(null)}>×</button></div>
          <label className="tribe-library-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tracks, artist, style…" /></label>
          <div className="tribe-track-grid">
            {filtered.map(t => (
              <article key={t.id} className="tribe-track-card">
                <img src={t.cover_url || '/her9al-logo.jpg'} alt="" />
                <div><b>{t.title}</b><span>{t.artist || 'HER9AL'} · {t.bpm || '—'} BPM</span></div>
                <button onClick={() => loadTrack('A', t)}>LOAD A</button>
                <button onClick={() => loadTrack('B', t)}>LOAD B</button>
              </article>
            ))}
            {!filtered.length && <p className="muted">No tracks found.</p>}
          </div>
        </section>
      )}

      {panel === 'settings' && (
        <section className="tribe-drawer tribe-settings-drawer">
          <div className="tribe-drawer-head"><div><Settings2/><b>DJ Settings</b></div><button onClick={() => setPanel(null)}>×</button></div>
          <div className="tribe-setting-row"><span>Master output</span><input type="range" min="0" max="1" step="0.01" value={master} onChange={e => setMaster(Number(e.target.value))} /></div>
          <div className="tribe-setting-row"><span>Crossfader</span><input type="range" min="-1" max="1" step="0.01" value={cross} onChange={e => setCross(Number(e.target.value))} /></div>
          <p className="muted">Double-click CUE to save a cue point. LOAD icons let you use local audio without uploading it.</p>
        </section>
      )}
    </div>
  );
}
