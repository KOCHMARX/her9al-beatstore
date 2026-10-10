'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A' | 'B';
type PadMode = 'hotcue' | 'padfx' | 'beatjump' | 'sampler';

type DeckState = {
  url: string;
  title: string;
  artist: string;
  bpm: number;
  playing: boolean;
  time: number;
  duration: number;
  cue: number;
  rate: number;
  channel: number;
  loopIn: number | null;
  loopOut: number | null;
  padMode: PadMode;
  hotCues: Array<number | null>;
};

type AudioNodes = {
  source: MediaElementAudioSourceNode;
  trim: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  filter: BiquadFilterNode;
  fxDelay: DelayNode;
  fxFeedback: GainNode;
  fxWet: GainNode;
  fxDry: GainNode;
  channel: GainNode;
  cross: GainNode;
};

const freshDeck = (): DeckState => ({
  url: '',
  title: 'NO TRACK LOADED',
  artist: 'HER9AL',
  bpm: 126,
  playing: false,
  time: 0,
  duration: 0,
  cue: 0,
  rate: 1,
  channel: 0.86,
  loopIn: null,
  loopOut: null,
  padMode: 'hotcue',
  hotCues: Array(8).fill(null),
});

const clamp = (v:number,min:number,max:number) => Math.max(min,Math.min(max,v));

function fmt(seconds:number) {
  if (!Number.isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export default function DJStudio() {
  const audioA = useRef<HTMLAudioElement>(null);
  const audioB = useRef<HTMLAudioElement>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const nodesA = useRef<AudioNodes | null>(null);
  const nodesB = useRef<AudioNodes | null>(null);
  const masterNode = useRef<GainNode | null>(null);

  const [A,setA] = useState<DeckState>(freshDeck());
  const [B,setB] = useState<DeckState>(freshDeck());
  const [cross,setCross] = useState(0);
  const [master,setMaster] = useState(.92);
  const [libraryOpen,setLibraryOpen] = useState(false);
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [scale,setScale] = useState(1);
  const [active,setActive] = useState<Record<string,boolean>>({});
  const [jogA,setJogA] = useState(0);
  const [jogB,setJogB] = useState(0);
  const [fxOn,setFxOn] = useState(false);
  const [fxDepth,setFxDepth] = useState(.25);

  const [knob,setKnob] = useState<Record<string,number>>({
    trimA:0, trimB:0,
    hiA:0, hiB:0,
    midA:0, midB:0,
    lowA:0, lowB:0,
    filterA:0, filterB:0,
    master:0, fx:0,
  });

  // The full reference canvas scales as one object. Nothing can drift independently.
  useEffect(() => {
    const resize = () => {
      const sx = window.innerWidth / 1351;
      const sy = window.innerHeight / 630;
      setScale(Math.min(sx,sy));
    };
    resize();
    window.addEventListener('resize',resize);
    return () => window.removeEventListener('resize',resize);
  },[]);

  // Keep the DJ page account-only if the project's session route is available.
  useEffect(() => {
    fetch('/api/auth/session',{cache:'no-store'})
      .then(r => {
        if (r.status === 401) window.location.href = '/login';
      })
      .catch(() => {});
  },[]);

  const element = (d:DeckId) => d === 'A' ? audioA.current : audioB.current;
  const deck = (d:DeckId) => d === 'A' ? A : B;
  const node = (d:DeckId) => d === 'A' ? nodesA.current : nodesB.current;

  const patch = (d:DeckId,next:Partial<DeckState>) => {
    if (d === 'A') setA(v => ({...v,...next}));
    else setB(v => ({...v,...next}));
  };

  const flash = (id:string,ms=150) => {
    setActive(v => ({...v,[id]:true}));
    window.setTimeout(() => setActive(v => ({...v,[id]:false})),ms);
  };

  const ensureAudioGraph = async () => {
    if (!audioA.current || !audioB.current) return;

    if (!contextRef.current) {
      const ctx = new AudioContext();
      contextRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = master;
      masterGain.connect(ctx.destination);
      masterNode.current = masterGain;

      const build = (media:HTMLMediaElement):AudioNodes => {
        const source = ctx.createMediaElementSource(media);

        const trim = ctx.createGain();

        const low = ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 250;

        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1200;
        mid.Q.value = .75;

        const high = ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 4500;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 20000;
        filter.Q.value = .7;

        const fxDry = ctx.createGain();
        const fxWet = ctx.createGain();
        const fxDelay = ctx.createDelay(2);
        const fxFeedback = ctx.createGain();
        const channel = ctx.createGain();
        const cross = ctx.createGain();

        fxDry.gain.value = 1;
        fxWet.gain.value = 0;
        fxDelay.delayTime.value = .28;
        fxFeedback.gain.value = .28;

        source.connect(trim);
        trim.connect(low);
        low.connect(mid);
        mid.connect(high);
        high.connect(filter);

        filter.connect(fxDry);
        fxDry.connect(channel);

        filter.connect(fxDelay);
        fxDelay.connect(fxFeedback);
        fxFeedback.connect(fxDelay);
        fxDelay.connect(fxWet);
        fxWet.connect(channel);

        channel.connect(cross);
        cross.connect(masterGain);

        return {
          source,trim,low,mid,high,filter,
          fxDelay,fxFeedback,fxWet,fxDry,
          channel,cross
        };
      };

      nodesA.current = build(audioA.current);
      nodesB.current = build(audioB.current);
    }

    if (contextRef.current.state === 'suspended') {
      await contextRef.current.resume();
    }
  };

  useEffect(() => {
    if (masterNode.current) masterNode.current.gain.value = master;
  },[master]);

  useEffect(() => {
    const left = cross <= 0 ? 1 : 1-cross;
    const right = cross >= 0 ? 1 : 1+cross;
    if (nodesA.current) nodesA.current.cross.gain.value = left;
    if (nodesB.current) nodesB.current.cross.gain.value = right;
  },[cross]);

  useEffect(() => {
    if (nodesA.current) nodesA.current.channel.gain.value = A.channel;
  },[A.channel]);

  useEffect(() => {
    if (nodesB.current) nodesB.current.channel.gain.value = B.channel;
  },[B.channel]);

  useEffect(() => {
    if (audioA.current) audioA.current.playbackRate = A.rate;
  },[A.rate]);

  useEffect(() => {
    if (audioB.current) audioB.current.playbackRate = B.rate;
  },[B.rate]);

  useEffect(() => {
    for (const n of [nodesA.current,nodesB.current]) {
      if (!n) continue;
      n.fxWet.gain.value = fxOn ? fxDepth : 0;
      n.fxDry.gain.value = fxOn ? 1-fxDepth*.45 : 1;
    }
  },[fxOn,fxDepth]);

  const loadFile = async (d:DeckId,file:File) => {
    await ensureAudioGraph();
    const url = URL.createObjectURL(file);
    patch(d,{
      url,
      title:file.name,
      artist:'Local file',
      playing:false,
      time:0,
      duration:0,
      cue:0,
      rate:1,
      loopIn:null,
      loopOut:null,
      hotCues:Array(8).fill(null)
    });
    setLibraryOpen(false);
    window.setTimeout(() => element(d)?.load(),0);
  };

  const playPause = async (d:DeckId) => {
    await ensureAudioGraph();
    const a = element(d);
    if (!a || !deck(d).url) return;
    flash(`play${d}`,220);

    if (a.paused) {
      await a.play();
      patch(d,{playing:true});
    } else {
      a.pause();
      patch(d,{playing:false});
    }
  };

  const cue = (d:DeckId) => {
    const a = element(d);
    if (!a) return;
    a.pause();
    a.currentTime = deck(d).cue;
    patch(d,{playing:false});
    flash(`cue${d}`,220);
  };

  const saveCue = (d:DeckId) => {
    const a = element(d);
    if (!a) return;
    patch(d,{cue:a.currentTime});
    flash(`cue${d}`,400);
  };

  const loopIn = (d:DeckId) => {
    const a = element(d);
    if (!a) return;
    patch(d,{loopIn:a.currentTime});
    flash(`in${d}`,180);
  };

  const loopOut = (d:DeckId) => {
    const a = element(d);
    if (!a) return;
    const start = deck(d).loopIn ?? Math.max(0,a.currentTime - 1);
    patch(d,{loopIn:start,loopOut:a.currentTime});
    flash(`out${d}`,180);
  };

  const loop4 = (d:DeckId) => {
    const a = element(d);
    if (!a) return;
    const length = 4*60/(deck(d).bpm || 126);
    patch(d,{loopIn:a.currentTime,loopOut:a.currentTime+length});
    flash(`loop${d}`,260);
  };

  const clearLoop = (d:DeckId) => {
    patch(d,{loopIn:null,loopOut:null});
  };

  const resizeLoop = (d:DeckId,factor:number) => {
    const s = deck(d);
    if (s.loopIn === null || s.loopOut === null) return;
    const length = (s.loopOut-s.loopIn)*factor;
    patch(d,{loopOut:s.loopIn+Math.max(.05,length)});
  };

  const sync = (d:DeckId) => {
    const other = d === 'A' ? B : A;
    const target = other.bpm || 126;
    patch(d,{bpm:target,rate:clamp(target/126,.84,1.16)});
    flash(`sync${d}`,280);
  };

  const timeUpdate = (d:DeckId) => {
    const a = element(d);
    if (!a) return;

    const s = deck(d);
    if (
      s.loopIn !== null &&
      s.loopOut !== null &&
      a.currentTime >= s.loopOut
    ) {
      a.currentTime = s.loopIn;
    }

    patch(d,{time:a.currentTime,duration:a.duration || 0});
  };

  const dragJog = (d:DeckId) => (e:React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    let previous = e.clientX;

    const move = (event:PointerEvent) => {
      const dx = event.clientX-previous;
      previous = event.clientX;

      const a = element(d);
      if (a && Number.isFinite(a.duration)) {
        a.currentTime = clamp(a.currentTime+dx*.025,0,a.duration);
      }

      if (d === 'A') setJogA(v => v+dx*.9);
      else setJogB(v => v+dx*.9);
    };

    const up = () => {
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };

    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const applyKnob = (id:string,angle:number) => {
    const norm = (angle+135)/270;
    const bipolar = norm*2-1;
    const deckId:DeckId | null = id.endsWith('A') ? 'A' : id.endsWith('B') ? 'B' : null;
    const n = deckId ? node(deckId) : null;

    if (id.startsWith('trim') && n) n.trim.gain.value = .25 + norm*1.75;
    if (id.startsWith('low') && n) n.low.gain.value = bipolar*12;
    if (id.startsWith('mid') && n) n.mid.gain.value = bipolar*12;
    if (id.startsWith('hi') && n) n.high.gain.value = bipolar*12;

    if (id.startsWith('filter') && n) {
      if (bipolar < 0) {
        n.filter.type = 'lowpass';
        n.filter.frequency.value = 20000*Math.pow(.03,-bipolar);
      } else {
        n.filter.type = 'highpass';
        n.filter.frequency.value = 30*Math.pow(250,bipolar);
      }
    }

    if (id === 'master') setMaster(norm);
    if (id === 'fx') setFxDepth(norm);
  };

  const dragKnob = (id:string) => async (e:React.PointerEvent<HTMLDivElement>) => {
    await ensureAudioGraph();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const start = knob[id] || 0;

    const move = (event:PointerEvent) => {
      const angle = clamp(start+(startY-event.clientY)*1.05,-135,135);
      setKnob(v => ({...v,[id]:angle}));
      applyKnob(id,angle);
    };

    const up = () => {
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };

    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const usePad = (d:DeckId,index:number) => {
    const s = deck(d);
    const a = element(d);
    if (!a) return;

    if (s.padMode === 'hotcue') {
      const cues = [...s.hotCues];
      if (cues[index] === null) cues[index] = a.currentTime;
      else a.currentTime = cues[index] as number;
      patch(d,{hotCues:cues});
    }

    if (s.padMode === 'beatjump') {
      const beats = [-8,-4,-2,-1,1,2,4,8];
      const jump = beats[index]*60/(s.bpm || 126);
      a.currentTime = clamp(a.currentTime+jump,0,a.duration || a.currentTime+jump);
    }

    if (s.padMode === 'padfx') {
      setFxOn(true);
      window.setTimeout(() => setFxOn(false),220);
    }

    flash(`pad${d}${index}`,180);
  };

  const Hot = ({
    id,x,y,w,h,onClick,round=false,
  }:{
    id:string,x:number,y:number,w:number,h:number,onClick:()=>void,round?:boolean
  }) => (
    <button
      className={`${styles.hit} ${round?styles.round:''} ${active[id]?styles.lit:''}`}
      style={{left:x,top:y,width:w,height:h}}
      onClick={onClick}
      aria-label={id}
    />
  );

  const Knob = ({
    id,src,x,y,size,
  }:{
    id:string,src:string,x:number,y:number,size:number
  }) => (
    <div
      className={styles.knob}
      style={{left:x,top:y,width:size,height:size}}
      onPointerDown={dragKnob(id)}
      aria-label={id}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{transform:`rotate(${knob[id] || 0}deg)`}}
      />
    </div>
  );

  return (
    <main className={styles.viewport}>
      <audio ref={audioA} src={A.url} onTimeUpdate={() => timeUpdate('A')} onEnded={() => patch('A',{playing:false})}/>
      <audio ref={audioB} src={B.url} onTimeUpdate={() => timeUpdate('B')} onEnded={() => patch('B',{playing:false})}/>

      <div
        className={styles.canvas}
        style={{transform:`translate(-50%,-50%) scale(${scale})`}}
      >
        <header className={styles.wavebar}>
          <div className={styles.trackLeft}>
            <strong>{A.title}</strong>
            <span>{A.artist}</span>
            <div className={styles.meta}>
              <b>{A.bpm}</b><small>BPM</small><em>{fmt(A.time)}</em>
            </div>
            <div className={styles.miniWave}/>
          </div>

          <div className={styles.centerWave}>
            <div className={styles.waveA}/>
            <div className={styles.waveB}/>
            <div className={styles.playhead}/>
            {[165,335,510,680,850].map(v => <i key={v} style={{left:v}}/>)}
          </div>

          <div className={styles.trackRight}>
            <strong>{B.title}</strong>
            <span>{B.artist}</span>
            <div className={styles.meta}>
              <b>{B.bpm}</b><small>BPM</small><em>{fmt(B.time)}</em>
            </div>
            <div className={styles.miniWave}/>
          </div>
        </header>

        <div className={styles.studioBar}>
          <button onClick={() => history.back()}>← Learning Dojo</button>
          <b>STUDIO</b>
          <span>HER9AL</span>
        </div>

        <section className={styles.controllerStage}>
          <div className={styles.controller}>
            <img className={styles.base} src="/dj/flx4-site.png" alt="DDJ-FLX4"/>

            <div
              className={`${styles.jog} ${styles.jogA} ${A.playing?styles.playing:''}`}
              onPointerDown={dragJog('A')}
            >
              <img src="/dj/jog-a.png" alt="" draggable={false} style={{transform:`rotate(${jogA}deg)`}}/>
            </div>

            <div
              className={`${styles.jog} ${styles.jogB} ${B.playing?styles.playing:''}`}
              onPointerDown={dragJog('B')}
            >
              <img src="/dj/jog-b.png" alt="" draggable={false} style={{transform:`rotate(${jogB}deg)`}}/>
            </div>

            <Knob id="trimA" src="/dj/trim-a.png" x={376} y={52} size={34}/>
            <Knob id="trimB" src="/dj/trim-b.png" x={448} y={52} size={34}/>
            <Knob id="hiA" src="/dj/hi-a.png" x={376} y={94} size={34}/>
            <Knob id="hiB" src="/dj/hi-b.png" x={448} y={94} size={34}/>
            <Knob id="midA" src="/dj/mid-a.png" x={376} y={136} size={34}/>
            <Knob id="midB" src="/dj/mid-b.png" x={448} y={136} size={34}/>
            <Knob id="lowA" src="/dj/low-a.png" x={376} y={179} size={34}/>
            <Knob id="lowB" src="/dj/low-b.png" x={448} y={179} size={34}/>
            <Knob id="filterA" src="/dj/filter-a.png" x={376} y={222} size={34}/>
            <Knob id="filterB" src="/dj/filter-b.png" x={448} y={222} size={34}/>
            <Knob id="master" src="/dj/master.png" x={511} y={50} size={38}/>
            <Knob id="fx" src="/dj/fx-depth.png" x={511} y={309} size={38}/>

            {/* Transport */}
            <Hot id="cueA" x={16} y={350} w={49} h={49} onClick={() => cue('A')} round/>
            <Hot id="playA" x={16} y={402} w={49} h={49} onClick={() => playPause('A')} round/>
            <Hot id="cueB" x={577} y={350} w={49} h={49} onClick={() => cue('B')} round/>
            <Hot id="playB" x={577} y={402} w={49} h={49} onClick={() => playPause('B')} round/>

            {/* Top loop controls */}
            <Hot id="inA" x={28} y={26} w={44} h={27} onClick={() => loopIn('A')} round/>
            <Hot id="outA" x={77} y={26} w={44} h={27} onClick={() => loopOut('A')} round/>
            <Hot id="loopA" x={128} y={26} w={62} h={27} onClick={() => loop4('A')}/>
            <Hot id="syncA" x={222} y={25} w={42} h={29} onClick={() => sync('A')} round/>

            <Hot id="inB" x={590} y={26} w={44} h={27} onClick={() => loopIn('B')} round/>
            <Hot id="outB" x={639} y={26} w={44} h={27} onClick={() => loopOut('B')} round/>
            <Hot id="loopB" x={690} y={26} w={62} h={27} onClick={() => loop4('B')}/>
            <Hot id="syncB" x={784} y={25} w={42} h={29} onClick={() => sync('B')} round/>

            {/* Loop call / half / double */}
            <Hot id="halfA" x={166} y={47} w={24} h={20} onClick={() => resizeLoop('A',.5)}/>
            <Hot id="doubleA" x={203} y={47} w={24} h={20} onClick={() => resizeLoop('A',2)}/>
            <Hot id="exitA" x={128} y={47} w={32} h={20} onClick={() => clearLoop('A')}/>
            <Hot id="halfB" x={728} y={47} w={24} h={20} onClick={() => resizeLoop('B',.5)}/>
            <Hot id="doubleB" x={765} y={47} w={24} h={20} onClick={() => resizeLoop('B',2)}/>
            <Hot id="exitB" x={690} y={47} w={32} h={20} onClick={() => clearLoop('B')}/>

            {/* Load */}
            <Hot id="loadA" x={349} y={8} w={42} h={27} onClick={() => setLibraryOpen(true)}/>
            <Hot id="loadB" x={421} y={8} w={42} h={27} onClick={() => setLibraryOpen(true)}/>

            {/* Pad modes */}
            <Hot id="modeHotA" x={73} y={343} w={38} h={18} onClick={() => patch('A',{padMode:'hotcue'})}/>
            <Hot id="modeFxA" x={116} y={343} w={38} h={18} onClick={() => patch('A',{padMode:'padfx'})}/>
            <Hot id="modeJumpA" x={159} y={343} w={38} h={18} onClick={() => patch('A',{padMode:'beatjump'})}/>
            <Hot id="modeSamplerA" x={202} y={343} w={38} h={18} onClick={() => patch('A',{padMode:'sampler'})}/>

            <Hot id="modeHotB" x={635} y={343} w={38} h={18} onClick={() => patch('B',{padMode:'hotcue'})}/>
            <Hot id="modeFxB" x={678} y={343} w={38} h={18} onClick={() => patch('B',{padMode:'padfx'})}/>
            <Hot id="modeJumpB" x={721} y={343} w={38} h={18} onClick={() => patch('B',{padMode:'beatjump'})}/>
            <Hot id="modeSamplerB" x={764} y={343} w={38} h={18} onClick={() => patch('B',{padMode:'sampler'})}/>

            {Array.from({length:8}).map((_,i) => (
              <Hot
                key={`pa${i}`}
                id={`padA${i}`}
                x={73+(i%4)*43}
                y={373+Math.floor(i/4)*39}
                w={38}
                h={35}
                onClick={() => usePad('A',i)}
              />
            ))}

            {Array.from({length:8}).map((_,i) => (
              <Hot
                key={`pb${i}`}
                id={`padB${i}`}
                x={635+(i%4)*43}
                y={373+Math.floor(i/4)*39}
                w={38}
                h={35}
                onClick={() => usePad('B',i)}
              />
            ))}

            {/* Real controls are completely transparent: no fake slider handles are drawn. */}
            <input className={`${styles.vertical} ${styles.tempoA}`} type="range" min=".84" max="1.16" step=".001" value={A.rate} onChange={e => patch('A',{rate:Number(e.target.value)})}/>
            <input className={`${styles.vertical} ${styles.tempoB}`} type="range" min=".84" max="1.16" step=".001" value={B.rate} onChange={e => patch('B',{rate:Number(e.target.value)})}/>
            <input className={`${styles.vertical} ${styles.channelA}`} type="range" min="0" max="1" step=".01" value={A.channel} onChange={e => patch('A',{channel:Number(e.target.value)})}/>
            <input className={`${styles.vertical} ${styles.channelB}`} type="range" min="0" max="1" step=".01" value={B.channel} onChange={e => patch('B',{channel:Number(e.target.value)})}/>
            <input className={styles.cross} type="range" min="-1" max="1" step=".01" value={cross} onChange={e => setCross(Number(e.target.value))}/>

            <Hot id="fxOn" x={510} y={377} w={38} h={38} onClick={() => setFxOn(v => !v)} round/>

            <button className={styles.storeCueA} onDoubleClick={() => saveCue('A')} aria-label="save cue A"/>
            <button className={styles.storeCueB} onDoubleClick={() => saveCue('B')} aria-label="save cue B"/>
          </div>
        </section>

        <button className={styles.flag}>⚑</button>

        <nav className={styles.dock}>
          <button onClick={() => setLibraryOpen(v => !v)}>♫ Music Library</button>
          <button>♬ DDJ-FLX4</button>
          <button onClick={() => setSettingsOpen(v => !v)}>⚙ Settings</button>
        </nav>

        <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

        {libraryOpen && (
          <aside className={styles.drawer}>
            <div className={styles.drawerHead}>
              <div><small>HER9AL</small><h2>Music Library</h2></div>
              <button onClick={() => setLibraryOpen(false)}>×</button>
            </div>
            <div className={styles.loadGrid}>
              <label>
                <strong>LOAD DECK A</strong>
                <span>MP3 / WAV / M4A</span>
                <input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && loadFile('A',e.target.files[0])}/>
              </label>
              <label>
                <strong>LOAD DECK B</strong>
                <span>MP3 / WAV / M4A</span>
                <input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && loadFile('B',e.target.files[0])}/>
              </label>
            </div>
          </aside>
        )}

        {settingsOpen && (
          <aside className={`${styles.drawer} ${styles.settings}`}>
            <div className={styles.drawerHead}>
              <div><small>HER9AL</small><h2>Settings</h2></div>
              <button onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <label>
              Master output
              <input type="range" min="0" max="1" step=".01" value={master} onChange={e => setMaster(Number(e.target.value))}/>
            </label>
            <p>Jog wheels scratch/seek. Mixer knobs use the Web Audio API for gain, 3-band EQ and filter. FX ON controls echo.</p>
          </aside>
        )}
      </div>
    </main>
  );
}
