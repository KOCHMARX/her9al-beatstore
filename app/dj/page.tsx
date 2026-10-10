'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A' | 'B';

type Deck = {
  url: string;
  title: string;
  artist: string;
  bpm: number;
  playing: boolean;
  time: number;
  duration: number;
  cue: number;
  rate: number;
  volume: number;
  loopIn: number | null;
  loopOut: number | null;
};

const initialDeck = (): Deck => ({
  url: '',
  title: 'NO TRACK LOADED',
  artist: 'HER9AL',
  bpm: 126,
  playing: false,
  time: 0,
  duration: 0,
  cue: 0,
  rate: 1,
  volume: 0.92,
  loopIn: null,
  loopOut: null,
});

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '00:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function DJStudio() {
  const audioA = useRef<HTMLAudioElement>(null);
  const audioB = useRef<HTMLAudioElement>(null);

  const [A, setA] = useState<Deck>(initialDeck());
  const [B, setB] = useState<Deck>(initialDeck());
  const [crossfader, setCrossfader] = useState(0);
  const [master, setMaster] = useState(0.95);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [jogA, setJogA] = useState(0);
  const [jogB, setJogB] = useState(0);

  const [knobs, setKnobs] = useState<Record<string, number>>({
    trimA: 0, hiA: 0, midA: 0, lowA: 0, filterA: 0,
    trimB: 0, hiB: 0, midB: 0, lowB: 0, filterB: 0,
    master: 0, fx: 0,
  });

  const audioFor = (deck: DeckId) => deck === 'A' ? audioA.current : audioB.current;
  const stateFor = (deck: DeckId) => deck === 'A' ? A : B;

  const patch = (deck: DeckId, next: Partial<Deck>) => {
    if (deck === 'A') setA(previous => ({ ...previous, ...next }));
    else setB(previous => ({ ...previous, ...next }));
  };

  const pulse = (id: string, duration = 160) => {
    setActive(previous => ({ ...previous, [id]: true }));
    window.setTimeout(() => {
      setActive(previous => ({ ...previous, [id]: false }));
    }, duration);
  };

  const gains = useMemo(() => {
    const left = crossfader <= 0 ? 1 : 1 - crossfader;
    const right = crossfader >= 0 ? 1 : 1 + crossfader;

    return {
      A: Math.max(0, Math.min(1, master * A.volume * left)),
      B: Math.max(0, Math.min(1, master * B.volume * right)),
    };
  }, [A.volume, B.volume, crossfader, master]);

  useEffect(() => {
    if (audioA.current) audioA.current.volume = gains.A;
  }, [gains.A]);

  useEffect(() => {
    if (audioB.current) audioB.current.volume = gains.B;
  }, [gains.B]);

  useEffect(() => {
    if (audioA.current) audioA.current.playbackRate = A.rate;
  }, [A.rate]);

  useEffect(() => {
    if (audioB.current) audioB.current.playbackRate = B.rate;
  }, [B.rate]);

  const loadLocal = (deck: DeckId, file: File) => {
    const url = URL.createObjectURL(file);
    patch(deck, {
      url,
      title: file.name,
      artist: 'Local file',
      playing: false,
      time: 0,
      duration: 0,
      cue: 0,
      rate: 1,
      loopIn: null,
      loopOut: null,
    });
    setLibraryOpen(false);
    window.setTimeout(() => audioFor(deck)?.load(), 0);
  };

  const playPause = async (deck: DeckId) => {
    const audio = audioFor(deck);
    if (!audio || !stateFor(deck).url) return;

    pulse(`play${deck}`, 220);

    if (audio.paused) {
      await audio.play();
      patch(deck, { playing: true });
    } else {
      audio.pause();
      patch(deck, { playing: false });
    }
  };

  const cue = (deck: DeckId) => {
    const audio = audioFor(deck);
    if (!audio) return;

    audio.pause();
    audio.currentTime = stateFor(deck).cue;
    patch(deck, { playing: false });
    pulse(`cue${deck}`, 220);
  };

  const storeCue = (deck: DeckId) => {
    const audio = audioFor(deck);
    if (!audio) return;
    patch(deck, { cue: audio.currentTime });
    pulse(`cue${deck}`, 420);
  };

  const sync = (deck: DeckId) => {
    const other = deck === 'A' ? B : A;
    const bpm = other.bpm || 126;
    patch(deck, { bpm, rate: bpm / 126 });
    pulse(`sync${deck}`, 260);
  };

  const loopFour = (deck: DeckId) => {
    const audio = audioFor(deck);
    if (!audio) return;

    const bpm = stateFor(deck).bpm || 126;
    const length = (4 * 60) / bpm;

    patch(deck, {
      loopIn: audio.currentTime,
      loopOut: audio.currentTime + length,
    });

    pulse(`loop${deck}`, 280);
  };

  const timeUpdate = (deck: DeckId) => {
    const audio = audioFor(deck);
    if (!audio) return;

    const current = stateFor(deck);

    if (
      current.loopIn !== null &&
      current.loopOut !== null &&
      audio.currentTime >= current.loopOut
    ) {
      audio.currentTime = current.loopIn;
    }

    patch(deck, {
      time: audio.currentTime,
      duration: audio.duration || 0,
    });
  };

  const dragJog = (deck: DeckId) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    let previousX = event.clientX;

    const move = (pointerEvent: PointerEvent) => {
      const delta = pointerEvent.clientX - previousX;
      previousX = pointerEvent.clientX;

      const audio = audioFor(deck);
      if (audio && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.max(
          0,
          Math.min(audio.duration, audio.currentTime + delta * 0.03)
        );
      }

      if (deck === 'A') setJogA(value => value + delta);
      else setJogB(value => value + delta);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragKnob = (id: string) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startY = event.clientY;
    const start = knobs[id] || 0;

    const move = (pointerEvent: PointerEvent) => {
      const angle = Math.max(
        -135,
        Math.min(135, start + (startY - pointerEvent.clientY) * 1.15)
      );

      setKnobs(previous => ({ ...previous, [id]: angle }));

      if (id === 'master') {
        setMaster((angle + 135) / 270);
      }
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const Hotspot = ({
    id, x, y, width, height, onClick, round = false,
  }: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    onClick: () => void;
    round?: boolean;
  }) => (
    <button
      className={`${styles.hotspot} ${round ? styles.round : ''} ${active[id] ? styles.active : ''}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
      }}
      onClick={onClick}
      aria-label={id}
    />
  );

  const Knob = ({
    id, x, y, size = 4,
  }: {
    id: string;
    x: number;
    y: number;
    size?: number;
  }) => (
    <div
      className={styles.knob}
      onPointerDown={dragKnob(id)}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}%`,
      }}
      aria-label={id}
    >
      <i style={{ transform: `translateX(-50%) rotate(${knobs[id] || 0}deg)` }} />
    </div>
  );

  return (
    <main className={styles.page}>
      <audio
        ref={audioA}
        src={A.url}
        onTimeUpdate={() => timeUpdate('A')}
        onEnded={() => patch('A', { playing: false })}
      />
      <audio
        ref={audioB}
        src={B.url}
        onTimeUpdate={() => timeUpdate('B')}
        onEnded={() => patch('B', { playing: false })}
      />

      <header className={styles.waveBar}>
        <div className={styles.trackInfo}>
          <strong>{A.title}</strong>
          <span>{A.artist}</span>
          <div className={styles.trackStats}>
            <b>{A.bpm}</b>
            <small>BPM</small>
            <em>{formatTime(A.time)}</em>
          </div>
          <div className={styles.smallWave} />
        </div>

        <div className={styles.dualWave}>
          <div className={styles.waveOne} />
          <div className={styles.waveTwo} />
          <div className={styles.wavePlayhead} />
          <div className={styles.beatMark} style={{ left: '12%' }} />
          <div className={styles.beatMark} style={{ left: '30%' }} />
          <div className={styles.beatMark} style={{ left: '68%' }} />
          <div className={styles.beatMark} style={{ left: '86%' }} />
        </div>

        <div className={`${styles.trackInfo} ${styles.trackInfoRight}`}>
          <strong>{B.title}</strong>
          <span>{B.artist}</span>
          <div className={styles.trackStats}>
            <b>{B.bpm}</b>
            <small>BPM</small>
            <em>{formatTime(B.time)}</em>
          </div>
          <div className={styles.smallWave} />
        </div>
      </header>

      <div className={styles.navbar}>
        <button onClick={() => history.back()}>← Learning Dojo</button>
        <b>STUDIO</b>
        <span />
      </div>

      <section className={styles.stage}>
        <div className={styles.controller}>
          <img
            src="/ddj-flx4-pro.png"
            className={styles.controllerImage}
            alt="DDJ-FLX4"
          />

          {/* Invisible jog interaction zones. The base image itself remains untouched. */}
          <div
            className={styles.jogA}
            onPointerDown={dragJog('A')}
            style={{ '--jog-angle': `${jogA}deg` } as React.CSSProperties}
          >
            <i />
          </div>

          <div
            className={styles.jogB}
            onPointerDown={dragJog('B')}
            style={{ '--jog-angle': `${jogB}deg` } as React.CSSProperties}
          >
            <i />
          </div>

          <Knob id="trimA" x={44.7} y={13.9} />
          <Knob id="trimB" x={53.3} y={13.9} />
          <Knob id="hiA" x={44.7} y={22.0} />
          <Knob id="hiB" x={53.3} y={22.0} />
          <Knob id="midA" x={44.7} y={30.0} />
          <Knob id="midB" x={53.3} y={30.0} />
          <Knob id="lowA" x={44.7} y={38.1} />
          <Knob id="lowB" x={53.3} y={38.1} />
          <Knob id="filterA" x={44.7} y={46.4} />
          <Knob id="filterB" x={53.3} y={46.4} />
          <Knob id="master" x={61.2} y={14.3} size={4.4} />
          <Knob id="fx" x={61.2} y={64.0} size={4.4} />

          <Hotspot id="cueA" x={0.8} y={66.8} width={6.1} height={9.2} onClick={() => cue('A')} round />
          <Hotspot id="playA" x={0.8} y={77.9} width={6.1} height={9.2} onClick={() => playPause('A')} round />
          <Hotspot id="cueB" x={67.3} y={66.8} width={6.1} height={9.2} onClick={() => cue('B')} round />
          <Hotspot id="playB" x={67.3} y={77.9} width={6.1} height={9.2} onClick={() => playPause('B')} round />

          <Hotspot id="syncA" x={24.8} y={6.0} width={4.7} height={5.4} onClick={() => sync('A')} round />
          <Hotspot id="syncB" x={91.0} y={6.0} width={4.7} height={5.4} onClick={() => sync('B')} round />
          <Hotspot id="loopA" x={12.0} y={5.0} width={9.6} height={5.7} onClick={() => loopFour('A')} />
          <Hotspot id="loopB" x={79.0} y={5.0} width={9.6} height={5.7} onClick={() => loopFour('B')} />
          <Hotspot id="loadA" x={41.1} y={0.8} width={4.8} height={5.0} onClick={() => setLibraryOpen(true)} />
          <Hotspot id="loadB" x={54.0} y={0.8} width={4.8} height={5.0} onClick={() => setLibraryOpen(true)} />

          {Array.from({ length: 8 }).map((_, index) => (
            <Hotspot
              key={`a-${index}`}
              id={`padA${index}`}
              x={7.2 + (index % 4) * 4.7}
              y={73.3 + Math.floor(index / 4) * 8.1}
              width={4.2}
              height={6.6}
              onClick={() => pulse(`padA${index}`, 180)}
            />
          ))}

          {Array.from({ length: 8 }).map((_, index) => (
            <Hotspot
              key={`b-${index}`}
              id={`padB${index}`}
              x={74.2 + (index % 4) * 4.7}
              y={73.3 + Math.floor(index / 4) * 8.1}
              width={4.2}
              height={6.6}
              onClick={() => pulse(`padB${index}`, 180)}
            />
          ))}

          {/* Real inputs are transparent, so nothing fake is drawn over the controller image. */}
          <input
            className={`${styles.hiddenVertical} ${styles.tempoA}`}
            type="range"
            min=".84"
            max="1.16"
            step=".001"
            value={A.rate}
            onChange={event => patch('A', { rate: Number(event.target.value) })}
            aria-label="Tempo A"
          />

          <input
            className={`${styles.hiddenVertical} ${styles.tempoB}`}
            type="range"
            min=".84"
            max="1.16"
            step=".001"
            value={B.rate}
            onChange={event => patch('B', { rate: Number(event.target.value) })}
            aria-label="Tempo B"
          />

          <input
            className={`${styles.hiddenVertical} ${styles.channelA}`}
            type="range"
            min="0"
            max="1"
            step=".01"
            value={A.volume}
            onChange={event => patch('A', { volume: Number(event.target.value) })}
            aria-label="Channel A"
          />

          <input
            className={`${styles.hiddenVertical} ${styles.channelB}`}
            type="range"
            min="0"
            max="1"
            step=".01"
            value={B.volume}
            onChange={event => patch('B', { volume: Number(event.target.value) })}
            aria-label="Channel B"
          />

          <input
            className={styles.hiddenCrossfader}
            type="range"
            min="-1"
            max="1"
            step=".01"
            value={crossfader}
            onChange={event => setCrossfader(Number(event.target.value))}
            aria-label="Crossfader"
          />

          <button className={styles.storeCueA} onDoubleClick={() => storeCue('A')} aria-label="Store cue A" />
          <button className={styles.storeCueB} onDoubleClick={() => storeCue('B')} aria-label="Store cue B" />
        </div>
      </section>

      <button className={styles.report}>⚑</button>

      <nav className={styles.bottomDock}>
        <button onClick={() => setLibraryOpen(value => !value)}>♫ Music Library</button>
        <button>♬ DDJ-FLX4</button>
        <button onClick={() => setSettingsOpen(value => !value)}>⚙ Settings</button>
      </nav>

      <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

      {libraryOpen && (
        <aside className={styles.drawer}>
          <div className={styles.drawerHeader}>
            <div>
              <small>HER9AL</small>
              <h2>Music Library</h2>
            </div>
            <button onClick={() => setLibraryOpen(false)}>×</button>
          </div>

          <div className={styles.loadGrid}>
            <label>
              <strong>LOAD DECK A</strong>
              <span>MP3 / WAV / M4A</span>
              <input type="file" accept="audio/*" onChange={event => {
                const file = event.target.files?.[0];
                if (file) loadLocal('A', file);
              }} />
            </label>

            <label>
              <strong>LOAD DECK B</strong>
              <span>MP3 / WAV / M4A</span>
              <input type="file" accept="audio/*" onChange={event => {
                const file = event.target.files?.[0];
                if (file) loadLocal('B', file);
              }} />
            </label>
          </div>
        </aside>
      )}

      {settingsOpen && (
        <aside className={`${styles.drawer} ${styles.settingsDrawer}`}>
          <div className={styles.drawerHeader}>
            <div>
              <small>HER9AL</small>
              <h2>Settings</h2>
            </div>
            <button onClick={() => setSettingsOpen(false)}>×</button>
          </div>

          <label>
            Master output
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              value={master}
              onChange={event => setMaster(Number(event.target.value))}
            />
          </label>

          <p>
            Drag the jog wheels left/right. Drag mixer knobs up/down.
            Double-click CUE to store a cue point.
          </p>
        </aside>
      )}
    </main>
  );
}
