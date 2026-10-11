'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A' | 'B';
type PadMode =
  | 'hotcue'
  | 'padfx1'
  | 'beatjump'
  | 'sampler'
  | 'keyboard'
  | 'padfx2'
  | 'beatloop'
  | 'keyshift';

type Track = {
  id?: string;
  title: string;
  artist?: string;
  url: string;
  bpm?: number;
};

type Deck = {
  track: Track | null;
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
  hotCues: Array<number | null>;
  padMode: PadMode;
  peaks: number[];
  tempoRange: number;
  cueMonitor: boolean;
};

type Nodes = {
  source: MediaElementAudioSourceNode;
  trim: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  filter: BiquadFilterNode;
  dry: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  wet: GainNode;
  channel: GainNode;
  cross: GainNode;
};

const clamp = (v:number,min:number,max:number) => Math.max(min,Math.min(max,v));

const freshDeck = (): Deck => ({
  track: null,
  title: 'NO TRACK LOADED',
  artist: 'HER9AL',
  bpm: 126,
  playing: false,
  time: 0,
  duration: 0,
  cue: 0,
  rate: 1,
  channel: .88,
  loopIn: null,
  loopOut: null,
  hotCues: Array(8).fill(null),
  padMode: 'hotcue',
  peaks: [],
  tempoRange: .16,
  cueMonitor: false,
});

function fmt(seconds:number){
  if(!Number.isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function Waveform({
  peaks,
  progress,
}:{
  peaks:number[];
  progress:number;
}){
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if(!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,rect.width,rect.height);

    const data = peaks.length
      ? peaks
      : Array.from(
          {length:260},
          (_,i) => .1 + .48 * Math.abs(Math.sin(i*.29) * Math.cos(i*.071))
        );

    const width = rect.width / data.length;
    const middle = rect.height / 2;

    data.forEach((peak,index) => {
      const h = Math.max(1, peak * rect.height * .88);
      ctx.fillStyle = index / data.length <= progress ? '#4da5ff' : '#275a82';
      ctx.fillRect(
        index * width,
        middle - h / 2,
        Math.max(1,width * .68),
        h
      );
    });
  },[peaks,progress]);

  return <canvas ref={ref} className={styles.waveCanvas}/>;
}

export default function DJStudio(){
  const audioA = useRef<HTMLAudioElement>(null);
  const audioB = useRef<HTMLAudioElement>(null);

  const fileA = useRef<HTMLInputElement>(null);
  const fileB = useRef<HTMLInputElement>(null);

  const jogAImage = useRef<HTMLImageElement>(null);
  const jogBImage = useRef<HTMLImageElement>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const nodesA = useRef<Nodes | null>(null);
  const nodesB = useRef<Nodes | null>(null);

  const jogOffsetA = useRef(0);
  const jogOffsetB = useRef(0);
  const animationRef = useRef<number | null>(null);

  const tapTimesA = useRef<number[]>([]);
  const tapTimesB = useRef<number[]>([]);

  const [A,setA] = useState<Deck>(freshDeck());
  const [B,setB] = useState<Deck>(freshDeck());

  const [crossfader,setCrossfader] = useState(0);
  const [master,setMaster] = useState(.92);

  const [fxOn,setFxOn] = useState(false);
  const [fxDepth,setFxDepth] = useState(.28);
  const [fxBeat,setFxBeat] = useState(1);
  const [fxType,setFxType] = useState<'delay'|'echo'|'filter'>('delay');

  const [libraryOpen,setLibraryOpen] = useState(false);
  const [settingsOpen,setSettingsOpen] = useState(false);

  const [tracks,setTracks] = useState<Track[]>([]);
  const [query,setQuery] = useState('');

  const [loading,setLoading] = useState(true);
  const [loadingProgress,setLoadingProgress] = useState(0);

  const [scratchingA,setScratchingA] = useState(false);
  const [scratchingB,setScratchingB] = useState(false);

  const [active,setActive] = useState<Record<string,boolean>>({});

  const audio = (deck:DeckId) => deck === 'A' ? audioA.current : audioB.current;
  const state = (deck:DeckId) => deck === 'A' ? A : B;
  const nodes = (deck:DeckId) => deck === 'A' ? nodesA.current : nodesB.current;

  const patch = (deck:DeckId,next:Partial<Deck>) => {
    if(deck === 'A') setA(previous => ({...previous,...next}));
    else setB(previous => ({...previous,...next}));
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      for(const pct of [8,22,41,60,78,92,100]){
        if(cancelled) return;
        setLoadingProgress(pct);
        await new Promise(resolve => setTimeout(resolve,pct === 100 ? 180 : 85));
      }

      if(!cancelled) setLoading(false);
    };

    run();

    return () => {
      cancelled = true;
    };
  },[]);

  useEffect(() => {
    fetch('/api/auth/session',{cache:'no-store'})
      .then(response => {
        if(response.status === 401) window.location.href = '/login';
      })
      .catch(() => {});

    fetch('/api/dj/tracks',{cache:'no-store'})
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        const list = (data?.tracks || [])
          .map((track:any) => ({
            id: track.id,
            title: track.title,
            artist: track.artist || 'HER9AL',
            url: track.audio_url || track.url,
            bpm: Number(track.bpm) || 126,
          }))
          .filter((track:any) => track.url);

        setTracks(list);
      })
      .catch(() => {});
  },[]);

  const flash = (id:string,ms=170) => {
    setActive(previous => ({...previous,[id]:true}));

    window.setTimeout(() => {
      setActive(previous => ({...previous,[id]:false}));
    },ms);
  };

  const ensureAudioGraph = async () => {
    if(!audioA.current || !audioB.current) return;

    if(!ctxRef.current){
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      const masterNode = ctx.createGain();
      masterNode.gain.value = master;
      masterNode.connect(ctx.destination);
      masterGainRef.current = masterNode;

      const createDeckNodes = (media:HTMLMediaElement):Nodes => {
        const source = ctx.createMediaElementSource(media);

        const trim = ctx.createGain();

        const low = ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 240;

        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1200;
        mid.Q.value = .8;

        const high = ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 4800;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 20000;

        const dry = ctx.createGain();
        const delay = ctx.createDelay(4);
        const feedback = ctx.createGain();
        const wet = ctx.createGain();
        const channel = ctx.createGain();
        const cross = ctx.createGain();

        dry.gain.value = 1;
        wet.gain.value = 0;
        delay.delayTime.value = .24;
        feedback.gain.value = .28;
        channel.gain.value = .88;

        source.connect(trim);
        trim.connect(low);
        low.connect(mid);
        mid.connect(high);
        high.connect(filter);

        filter.connect(dry);
        dry.connect(channel);

        filter.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(channel);

        channel.connect(cross);
        cross.connect(masterNode);

        return {
          source,
          trim,
          low,
          mid,
          high,
          filter,
          dry,
          delay,
          feedback,
          wet,
          channel,
          cross,
        };
      };

      nodesA.current = createDeckNodes(audioA.current);
      nodesB.current = createDeckNodes(audioB.current);
    }

    if(ctxRef.current.state === 'suspended'){
      await ctxRef.current.resume();
    }
  };

  useEffect(() => {
    if(masterGainRef.current){
      masterGainRef.current.gain.value = master;
    }
  },[master]);

  useEffect(() => {
    if(nodesA.current){
      nodesA.current.channel.gain.value = A.channel;
    }

    if(nodesB.current){
      nodesB.current.channel.gain.value = B.channel;
    }
  },[A.channel,B.channel]);

  useEffect(() => {
    const left = crossfader <= 0 ? 1 : 1 - crossfader;
    const right = crossfader >= 0 ? 1 : 1 + crossfader;

    if(nodesA.current){
      nodesA.current.cross.gain.value = left;
    }

    if(nodesB.current){
      nodesB.current.cross.gain.value = right;
    }
  },[crossfader]);

  useEffect(() => {
    if(audioA.current) audioA.current.playbackRate = A.rate;
  },[A.rate]);

  useEffect(() => {
    if(audioB.current) audioB.current.playbackRate = B.rate;
  },[B.rate]);

  useEffect(() => {
    const bpm = (A.bpm + B.bpm) / 2 || 126;
    const beatSeconds = 60 / bpm;
    const delaySeconds = clamp(beatSeconds * fxBeat,.03,3.5);

    for(const deckNodes of [nodesA.current,nodesB.current]){
      if(!deckNodes) continue;

      deckNodes.delay.delayTime.value = delaySeconds;

      if(fxType === 'filter'){
        deckNodes.wet.gain.value = 0;
        deckNodes.dry.gain.value = 1;
        deckNodes.filter.type = 'lowpass';
        deckNodes.filter.frequency.value = fxOn
          ? 1200 + fxDepth * 8000
          : 20000;
      }else{
        deckNodes.wet.gain.value = fxOn ? fxDepth : 0;
        deckNodes.dry.gain.value = fxOn ? 1 - fxDepth * .35 : 1;
        deckNodes.feedback.gain.value = fxType === 'echo' ? .45 : .28;
      }
    }
  },[fxOn,fxDepth,fxBeat,fxType,A.bpm,B.bpm]);

  // Smooth platter rotation tied directly to audio currentTime.
  useEffect(() => {
    const render = () => {
      const leftTime = audioA.current?.currentTime || 0;
      const rightTime = audioB.current?.currentTime || 0;

      if(jogAImage.current){
        jogAImage.current.style.transform =
          `rotate(${leftTime * 180 + jogOffsetA.current}deg)`;
      }

      if(jogBImage.current){
        jogBImage.current.style.transform =
          `rotate(${rightTime * 180 + jogOffsetB.current}deg)`;
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if(animationRef.current !== null){
        cancelAnimationFrame(animationRef.current);
      }
    };
  },[]);

  const buildPeaks = async (file:File) => {
    try{
      const ctx = ctxRef.current || new AudioContext();
      const data = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(data.slice(0));
      const channel = buffer.getChannelData(0);

      const bins = 320;
      const block = Math.max(1,Math.floor(channel.length / bins));
      const output:number[] = [];

      for(let i=0;i<bins;i++){
        let max = 0;
        const start = i * block;
        const end = Math.min(channel.length,start + block);
        const step = Math.max(1,Math.floor(block / 64));

        for(let sample=start;sample<end;sample+=step){
          max = Math.max(max,Math.abs(channel[sample]));
        }

        output.push(Math.max(.025,max));
      }

      return output;
    }catch{
      return [];
    }
  };

  const loadLocal = async (deck:DeckId,file:File) => {
    await ensureAudioGraph();

    const peaks = await buildPeaks(file);
    const url = URL.createObjectURL(file);

    patch(deck,{
      track:{
        title:file.name,
        artist:'Local file',
        url,
        bpm:126,
      },
      title:file.name,
      artist:'Local file',
      bpm:126,
      playing:false,
      time:0,
      duration:0,
      cue:0,
      rate:1,
      loopIn:null,
      loopOut:null,
      peaks,
      hotCues:Array(8).fill(null),
    });

    if(deck === 'A') jogOffsetA.current = 0;
    else jogOffsetB.current = 0;

    setLibraryOpen(false);

    window.setTimeout(() => {
      audio(deck)?.load();
    },0);
  };

  const loadTrack = async (deck:DeckId,track:Track) => {
    await ensureAudioGraph();

    patch(deck,{
      track,
      title:track.title,
      artist:track.artist || 'HER9AL',
      bpm:track.bpm || 126,
      playing:false,
      time:0,
      duration:0,
      cue:0,
      rate:1,
      loopIn:null,
      loopOut:null,
      peaks:[],
      hotCues:Array(8).fill(null),
    });

    if(deck === 'A') jogOffsetA.current = 0;
    else jogOffsetB.current = 0;

    setLibraryOpen(false);

    window.setTimeout(() => {
      audio(deck)?.load();
    },0);
  };

  const playPause = async (deck:DeckId) => {
    await ensureAudioGraph();

    const element = audio(deck);

    if(!element || !state(deck).track) return;

    flash(`play-${deck}`,220);

    if(element.paused){
      await element.play();
      patch(deck,{playing:true});
    }else{
      element.pause();
      patch(deck,{playing:false});
    }
  };

  const cue = (deck:DeckId) => {
    const element = audio(deck);
    if(!element) return;

    element.pause();
    element.currentTime = state(deck).cue;

    patch(deck,{playing:false});
    flash(`cue-${deck}`,220);
  };

  const storeCue = (deck:DeckId) => {
    const element = audio(deck);
    if(!element) return;

    patch(deck,{cue:element.currentTime});
    flash(`cue-${deck}`,360);
  };

  const loopIn = (deck:DeckId) => {
    const element = audio(deck);
    if(!element) return;

    patch(deck,{loopIn:element.currentTime});
    flash(`in-${deck}`,160);
  };

  const loopOut = (deck:DeckId) => {
    const element = audio(deck);
    if(!element) return;

    const start = state(deck).loopIn ?? Math.max(0,element.currentTime - .5);

    patch(deck,{
      loopIn:start,
      loopOut:Math.max(start + .05,element.currentTime),
    });

    flash(`out-${deck}`,160);
  };

  const toggleFourBeatLoop = (deck:DeckId) => {
    const element = audio(deck);
    const current = state(deck);

    if(!element) return;

    if(current.loopIn !== null && current.loopOut !== null){
      patch(deck,{loopIn:null,loopOut:null});
      return;
    }

    const length = 4 * 60 / (current.bpm || 126);

    patch(deck,{
      loopIn:element.currentTime,
      loopOut:element.currentTime + length,
    });

    flash(`loop-${deck}`,220);
  };

  const resizeLoop = (deck:DeckId,factor:number) => {
    const current = state(deck);

    if(current.loopIn === null || current.loopOut === null) return;

    patch(deck,{
      loopOut:
        current.loopIn +
        Math.max(.05,(current.loopOut - current.loopIn) * factor),
    });
  };

  const sync = (deck:DeckId) => {
    const other = deck === 'A' ? B : A;
    const current = state(deck);
    const target = other.bpm || 126;

    patch(deck,{
      bpm:target,
      rate:clamp(
        target / 126,
        1 - current.tempoRange,
        1 + current.tempoRange
      ),
    });

    flash(`sync-${deck}`,220);
  };

  const cycleTempoRange = (deck:DeckId) => {
    const ranges = [.06,.10,.16,.50];
    const current = state(deck).tempoRange;
    const index = ranges.findIndex(value => Math.abs(value-current)<.001);

    patch(deck,{
      tempoRange:ranges[(index + 1) % ranges.length],
    });

    flash(`range-${deck}`,180);
  };

  const timeUpdate = (deck:DeckId) => {
    const element = audio(deck);
    if(!element) return;

    const current = state(deck);

    if(
      current.loopIn !== null &&
      current.loopOut !== null &&
      element.currentTime >= current.loopOut
    ){
      element.currentTime = current.loopIn;
    }

    patch(deck,{
      time:element.currentTime,
      duration:element.duration || 0,
    });
  };

  const jogPointerDown = (deck:DeckId) => (event:React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if(deck === 'A') setScratchingA(true);
    else setScratchingB(true);

    let previousX = event.clientX;

    const move = (pointerEvent:PointerEvent) => {
      const delta = pointerEvent.clientX - previousX;
      previousX = pointerEvent.clientX;

      const element = audio(deck);

      if(element && Number.isFinite(element.duration)){
        element.currentTime = clamp(
          element.currentTime + delta * .022,
          0,
          element.duration
        );
      }

      if(deck === 'A') jogOffsetA.current += delta * .9;
      else jogOffsetB.current += delta * .9;
    };

    const up = () => {
      if(deck === 'A') setScratchingA(false);
      else setScratchingB(false);

      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };

    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const dragKnob =
    (
      deck:DeckId | null,
      kind:'trim'|'high'|'mid'|'low'|'filter'|'master'|'fx'
    ) =>
    async (event:React.PointerEvent<HTMLButtonElement>) => {
      await ensureAudioGraph();

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const startY = event.clientY;

      const move = (pointerEvent:PointerEvent) => {
        const normal = clamp(.5 + (startY - pointerEvent.clientY) / 180,0,1);
        const bipolar = normal * 2 - 1;
        const deckNodes = deck ? nodes(deck) : null;

        if(kind === 'trim' && deckNodes){
          deckNodes.trim.gain.value = .2 + normal * 1.8;
        }

        if(kind === 'high' && deckNodes){
          deckNodes.high.gain.value = bipolar * 12;
        }

        if(kind === 'mid' && deckNodes){
          deckNodes.mid.gain.value = bipolar * 12;
        }

        if(kind === 'low' && deckNodes){
          deckNodes.low.gain.value = bipolar * 12;
        }

        if(kind === 'filter' && deckNodes){
          if(bipolar < 0){
            deckNodes.filter.type = 'lowpass';
            deckNodes.filter.frequency.value =
              20000 * Math.pow(.025,-bipolar);
          }else{
            deckNodes.filter.type = 'highpass';
            deckNodes.filter.frequency.value =
              30 * Math.pow(300,bipolar);
          }
        }

        if(kind === 'master'){
          setMaster(normal);
        }

        if(kind === 'fx'){
          setFxDepth(normal);
        }
      };

      const up = () => {
        window.removeEventListener('pointermove',move);
        window.removeEventListener('pointerup',up);
      };

      window.addEventListener('pointermove',move);
      window.addEventListener('pointerup',up);
    };

  const tapBpm = (deck:DeckId) => {
    const ref = deck === 'A' ? tapTimesA : tapTimesB;
    const now = performance.now();

    ref.current = [...ref.current,now].slice(-5);

    if(ref.current.length >= 2){
      const intervals = ref.current
        .slice(1)
        .map((value,index) => value - ref.current[index]);

      const average =
        intervals.reduce((sum,value) => sum + value,0) /
        intervals.length;

      patch(deck,{
        bpm:clamp(Math.round(60000 / average),50,220),
      });
    }

    flash(`tap-${deck}`,150);
  };

  const usePad = (deck:DeckId,index:number) => {
    const element = audio(deck);
    const current = state(deck);

    if(!element) return;

    if(current.padMode === 'hotcue'){
      const cues = [...current.hotCues];

      if(cues[index] === null){
        cues[index] = element.currentTime;
      }else{
        element.currentTime = cues[index] as number;
      }

      patch(deck,{hotCues:cues});
    }

    if(current.padMode === 'beatjump'){
      const beats = [-8,-4,-2,-1,1,2,4,8];
      const jump = beats[index] * 60 / (current.bpm || 126);

      element.currentTime = clamp(
        element.currentTime + jump,
        0,
        element.duration || element.currentTime
      );
    }

    if(current.padMode === 'beatloop'){
      const beats = [.25,.5,1,2,4,8,16,32];
      const length = beats[index] * 60 / (current.bpm || 126);

      patch(deck,{
        loopIn:element.currentTime,
        loopOut:element.currentTime + length,
      });
    }

    if(current.padMode === 'padfx1' || current.padMode === 'padfx2'){
      setFxOn(true);

      setFxDepth(
        current.padMode === 'padfx1'
          ? .25 + .06 * (index % 4)
          : .55 + .05 * (index % 4)
      );

      window.setTimeout(() => setFxOn(false),230);
    }

    if(current.padMode === 'sampler' && current.track?.url){
      const sample = new Audio(current.track.url);
      sample.volume = .6;
      sample.currentTime = current.hotCues[index] ?? current.cue;
      sample.play().catch(() => {});
      window.setTimeout(() => sample.pause(),350);
    }

    if(current.padMode === 'keyshift'){
      const semitones = [-4,-3,-2,-1,1,2,3,4][index];

      patch(deck,{
        rate:clamp(
          Math.pow(2,semitones/12),
          .75,
          1.33
        ),
      });
    }

    if(current.padMode === 'keyboard'){
      const ctx = ctxRef.current;

      if(ctx && masterGainRef.current){
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.frequency.value =
          220 * Math.pow(2,index/12);

        gain.gain.value = .05;

        oscillator.connect(gain);
        gain.connect(masterGainRef.current);

        oscillator.start();

        gain.gain.exponentialRampToValueAtTime(
          .001,
          ctx.currentTime + .2
        );

        oscillator.stop(ctx.currentTime + .22);
      }
    }

    flash(`pad-${deck}-${index}`,180);
  };

  const Hotspot = ({
    id,
    x,
    y,
    w,
    h,
    onClick,
    onPointerDown,
    round=false,
  }:{
    id:string;
    x:number;
    y:number;
    w:number;
    h:number;
    onClick?:()=>void;
    onPointerDown?:any;
    round?:boolean;
  }) => (
    <button
      className={`${styles.hotspot} ${round?styles.round:''} ${active[id]?styles.active:''}`}
      style={{
        left:`${x}%`,
        top:`${y}%`,
        width:`${w}%`,
        height:`${h}%`,
      }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-label={id}
    />
  );

  const progressA = A.duration ? A.time / A.duration : 0;
  const progressB = B.duration ? B.time / B.duration : 0;

  const filteredTracks = tracks.filter(track =>
    `${track.title} ${track.artist || ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const topModes:PadMode[] = [
    'hotcue',
    'padfx1',
    'beatjump',
    'sampler',
  ];

  const bottomModes:PadMode[] = [
    'keyboard',
    'padfx2',
    'beatloop',
    'keyshift',
  ];

  const debug =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === '1';

  return (
    <main className={styles.viewport}>
      <audio
        ref={audioA}
        src={A.track?.url || ''}
        onTimeUpdate={() => timeUpdate('A')}
        onEnded={() => patch('A',{playing:false})}
      />

      <audio
        ref={audioB}
        src={B.track?.url || ''}
        onTimeUpdate={() => timeUpdate('B')}
        onEnded={() => patch('B',{playing:false})}
      />

      <input
        ref={fileA}
        hidden
        type="file"
        accept="audio/*"
        onChange={event => {
          const file = event.target.files?.[0];
          if(file) loadLocal('A',file);
        }}
      />

      <input
        ref={fileB}
        hidden
        type="file"
        accept="audio/*"
        onChange={event => {
          const file = event.target.files?.[0];
          if(file) loadLocal('B',file);
        }}
      />

      {loading && (
        <div className={styles.loader}>
          <div className={styles.loaderCard}>
            <div className={styles.loaderWheel}>
              <span>H</span>
            </div>

            <small>HER9AL WEB DJ</small>
            <h1>Loading DDJ-FLX4</h1>

            <div className={styles.loadingBar}>
              <i style={{width:`${loadingProgress}%`}}/>
            </div>

            <b>{loadingProgress}%</b>
          </div>
        </div>
      )}

      <div className={styles.designCanvas}>
        <header className={styles.header}>
          <div className={styles.deckInfo}>
            <strong>{A.title}</strong>
            <span>{A.artist}</span>

            <div className={styles.deckStats}>
              <b>A</b>
              <em>{A.bpm} BPM</em>
              <i>{fmt(A.time)} / {fmt(A.duration)}</i>
            </div>

            <div className={styles.miniWave}>
              <Waveform peaks={A.peaks} progress={progressA}/>
            </div>
          </div>

          <div className={styles.centerWave}>
            <div className={styles.waveRow}>
              <Waveform peaks={A.peaks} progress={progressA}/>
            </div>

            <div className={styles.waveRow}>
              <Waveform peaks={B.peaks} progress={progressB}/>
            </div>

            <div className={styles.playhead}/>

            {[18,38,62,82].map(value => (
              <i key={value} style={{left:`${value}%`}}/>
            ))}
          </div>

          <div className={`${styles.deckInfo} ${styles.deckInfoRight}`}>
            <strong>{B.title}</strong>
            <span>{B.artist}</span>

            <div className={styles.deckStats}>
              <b>B</b>
              <em>{B.bpm} BPM</em>
              <i>{fmt(B.time)} / {fmt(B.duration)}</i>
            </div>

            <div className={styles.miniWave}>
              <Waveform peaks={B.peaks} progress={progressB}/>
            </div>
          </div>
        </header>

        <div className={styles.studioBar}>
          <button onClick={() => history.back()}>
            ← HER9AL
          </button>

          <strong>STUDIO</strong>

          <span>{fxType.toUpperCase()} FX</span>
        </div>

        <div className={styles.stage}>
          <div className={`${styles.controller} ${debug?styles.debug:''}`}>
            <img
              src="/dj/flx4-4k.png"
              className={styles.controllerBase}
              alt="DDJ-FLX4"
            />

            <div
              className={`${styles.jog} ${styles.jogA} ${scratchingA?styles.scratching:''}`}
              onPointerDown={jogPointerDown('A')}
            >
              <img
                ref={jogAImage}
                src="/dj/jog-a.png"
                alt=""
                draggable={false}
              />
            </div>

            <div
              className={`${styles.jog} ${styles.jogB} ${scratchingB?styles.scratching:''}`}
              onPointerDown={jogPointerDown('B')}
            >
              <img
                ref={jogBImage}
                src="/dj/jog-b.png"
                alt=""
                draggable={false}
              />
            </div>

            {/* LOAD / BACK / VIEW */}
            <Hotspot id="load-a" x={38.5} y={4.4} w={4.3} h={4.2} onClick={() => setLibraryOpen(true)}/>
            <Hotspot id="back" x={48.0} y={3.7} w={4.2} h={4.3} onClick={() => setLibraryOpen(false)} round/>
            <Hotspot id="load-b" x={51.2} y={4.4} w={4.3} h={4.2} onClick={() => setLibraryOpen(true)}/>
            <Hotspot id="view" x={55.0} y={6.6} w={3.5} h={3.0} onClick={() => setLibraryOpen(v => !v)}/>

            {/* LEFT DECK TOP ROW */}
            <Hotspot id="in-a" x={3.0} y={8.8} w={3.7} h={5.2} onClick={() => loopIn('A')} round/>
            <Hotspot id="out-a" x={8.4} y={8.8} w={3.7} h={5.2} onClick={() => loopOut('A')} round/>
            <Hotspot id="loop-a" x={13.7} y={8.9} w={3.7} h={4.8} onClick={() => toggleFourBeatLoop('A')} round/>
            <Hotspot id="call-prev-a" x={18.7} y={8.9} w={3.0} h={4.8} onClick={() => resizeLoop('A',.5)} round/>
            <Hotspot id="call-next-a" x={23.0} y={8.9} w={3.0} h={4.8} onClick={() => resizeLoop('A',2)} round/>
            <Hotspot id="sync-a" x={28.3} y={8.7} w={3.5} h={5.4} onClick={() => sync('A')} round/>
            <Hotspot id="range-a" x={27.7} y={15.4} w={4.5} h={2.7} onClick={() => cycleTempoRange('A')}/>

            {/* RIGHT DECK TOP ROW */}
            <Hotspot id="in-b" x={68.1} y={8.8} w={3.7} h={5.2} onClick={() => loopIn('B')} round/>
            <Hotspot id="out-b" x={73.5} y={8.8} w={3.7} h={5.2} onClick={() => loopOut('B')} round/>
            <Hotspot id="loop-b" x={78.9} y={8.9} w={3.7} h={4.8} onClick={() => toggleFourBeatLoop('B')} round/>
            <Hotspot id="call-prev-b" x={84.0} y={8.9} w={3.0} h={4.8} onClick={() => resizeLoop('B',.5)} round/>
            <Hotspot id="call-next-b" x={88.3} y={8.9} w={3.0} h={4.8} onClick={() => resizeLoop('B',2)} round/>
            <Hotspot id="sync-b" x={93.5} y={8.7} w={3.5} h={5.4} onClick={() => sync('B')} round/>
            <Hotspot id="range-b" x={92.9} y={15.4} w={4.5} h={2.7} onClick={() => cycleTempoRange('B')}/>

            {/* MIXER KNOBS — invisible drag zones; clean image remains untouched */}
            <Hotspot id="trim-a" x={42.9} y={14.2} w={5.2} h={6.5} onPointerDown={dragKnob('A','trim')} round/>
            <Hotspot id="trim-b" x={50.6} y={14.2} w={5.2} h={6.5} onPointerDown={dragKnob('B','trim')} round/>

            <Hotspot id="high-a" x={42.9} y={22.2} w={5.2} h={6.5} onPointerDown={dragKnob('A','high')} round/>
            <Hotspot id="high-b" x={50.6} y={22.2} w={5.2} h={6.5} onPointerDown={dragKnob('B','high')} round/>

            <Hotspot id="mid-a" x={42.9} y={30.6} w={5.2} h={6.5} onPointerDown={dragKnob('A','mid')} round/>
            <Hotspot id="mid-b" x={50.6} y={30.4} w={5.2} h={6.5} onPointerDown={dragKnob('B','mid')} round/>

            <Hotspot id="low-a" x={42.9} y={39.5} w={5.2} h={6.5} onPointerDown={dragKnob('A','low')} round/>
            <Hotspot id="low-b" x={50.6} y={39.5} w={5.2} h={6.5} onPointerDown={dragKnob('B','low')} round/>

            <Hotspot id="filter-a" x={42.9} y={48.1} w={5.2} h={6.5} onPointerDown={dragKnob('A','filter')} round/>
            <Hotspot id="filter-b" x={50.6} y={48.1} w={5.2} h={6.5} onPointerDown={dragKnob('B','filter')} round/>

            <Hotspot id="master" x={59.1} y={14.1} w={5.3} h={6.9} onPointerDown={dragKnob(null,'master')} round/>
            <Hotspot id="fx-depth" x={59.1} y={68.6} w={5.3} h={6.9} onPointerDown={dragKnob(null,'fx')} round/>

            {/* CHANNEL CUE */}
            <Hotspot id="channel-cue-a" x={43.7} y={59.0} w={4.2} h={3.6} onClick={() => patch('A',{cueMonitor:!A.cueMonitor})}/>
            <Hotspot id="channel-cue-b" x={51.8} y={59.0} w={4.2} h={3.6} onClick={() => patch('B',{cueMonitor:!B.cueMonitor})}/>

            {/* TRANSPORT */}
            <Hotspot id="cue-a" x={1.9} y={73.6} w={5.8} h={8.8} onClick={() => cue('A')} round/>
            <Hotspot id="play-a" x={1.9} y={83.7} w={5.8} h={8.8} onClick={() => playPause('A')} round/>
            <Hotspot id="cue-b" x={67.0} y={73.6} w={5.8} h={8.8} onClick={() => cue('B')} round/>
            <Hotspot id="play-b" x={67.0} y={83.7} w={5.8} h={8.8} onClick={() => playPause('B')} round/>

            {/* SHIFT */}
            <Hotspot id="shift-a" x={3.1} y={65.5} w={4.2} h={4.2}
              onClick={() => patch('A',{padMode:A.padMode==='hotcue'?'keyboard':'hotcue'})}/>
            <Hotspot id="shift-b" x={68.3} y={65.5} w={4.2} h={4.2}
              onClick={() => patch('B',{padMode:B.padMode==='hotcue'?'keyboard':'hotcue'})}/>

            {/* PAD MODES */}
            {topModes.map((mode,index) => (
              <Hotspot
                key={`mode-top-a-${mode}`}
                id={`mode-top-a-${mode}`}
                x={8.2 + index * 5.2}
                y={71.4}
                w={4.8}
                h={3.0}
                onClick={() => patch('A',{padMode:mode})}
              />
            ))}

            {bottomModes.map((mode,index) => (
              <Hotspot
                key={`mode-bottom-a-${mode}`}
                id={`mode-bottom-a-${mode}`}
                x={8.2 + index * 5.2}
                y={74.2}
                w={4.8}
                h={2.7}
                onClick={() => patch('A',{padMode:mode})}
              />
            ))}

            {topModes.map((mode,index) => (
              <Hotspot
                key={`mode-top-b-${mode}`}
                id={`mode-top-b-${mode}`}
                x={73.4 + index * 5.2}
                y={71.4}
                w={4.8}
                h={3.0}
                onClick={() => patch('B',{padMode:mode})}
              />
            ))}

            {bottomModes.map((mode,index) => (
              <Hotspot
                key={`mode-bottom-b-${mode}`}
                id={`mode-bottom-b-${mode}`}
                x={73.4 + index * 5.2}
                y={74.2}
                w={4.8}
                h={2.7}
                onClick={() => patch('B',{padMode:mode})}
              />
            ))}

            {/* PADS */}
            {Array.from({length:8}).map((_,index) => (
              <Hotspot
                key={`pad-a-${index}`}
                id={`pad-a-${index}`}
                x={8.4 + (index % 4) * 5.15}
                y={77.7 + Math.floor(index / 4) * 7.8}
                w={4.4}
                h={6.8}
                onClick={() => usePad('A',index)}
              />
            ))}

            {Array.from({length:8}).map((_,index) => (
              <Hotspot
                key={`pad-b-${index}`}
                id={`pad-b-${index}`}
                x={73.6 + (index % 4) * 5.15}
                y={77.7 + Math.floor(index / 4) * 7.8}
                w={4.4}
                h={6.8}
                onClick={() => usePad('B',index)}
              />
            ))}

            {/* SMART CFX / SMART FADER */}
            <Hotspot id="smart-cfx" x={35.9} y={49.7} w={4.0} h={4.8} onClick={() => setFxOn(value => !value)} round/>
            <Hotspot id="smart-fader" x={35.9} y={80.8} w={4.0} h={4.8} onClick={() => setCrossfader(0)} round/>

            {/* BEAT FX */}
            <Hotspot id="fx-select" x={58.8} y={51.0} w={5.6} h={4.2}
              onClick={() => setFxType(value => value==='delay'?'echo':value==='echo'?'filter':'delay')}/>
            <Hotspot id="beat-minus" x={58.6} y={58.7} w={2.7} h={3.4}
              onClick={() => setFxBeat(value => clamp(value/2,.25,4))}/>
            <Hotspot id="beat-plus" x={61.5} y={58.7} w={2.7} h={3.4}
              onClick={() => setFxBeat(value => clamp(value*2,.25,4))}/>
            <Hotspot id="auto" x={58.2} y={62.0} w={3.1} h={3.1} onClick={() => setFxBeat(1)}/>
            <Hotspot id="tap-a" x={61.3} y={62.0} w={3.1} h={3.1} onClick={() => tapBpm('A')}/>
            <Hotspot id="tap-b" x={61.3} y={64.9} w={3.1} h={3.1} onClick={() => tapBpm('B')}/>
            <Hotspot id="fx-on" x={59.0} y={79.7} w={5.1} h={5.7} onClick={() => setFxOn(value => !value)} round/>

            {/* FADERS */}
            <input
              className={`${styles.verticalRange} ${styles.tempoA}`}
              type="range"
              min={1-A.tempoRange}
              max={1+A.tempoRange}
              step=".001"
              value={A.rate}
              onChange={event => patch('A',{rate:Number(event.target.value)})}
            />

            <input
              className={`${styles.verticalRange} ${styles.tempoB}`}
              type="range"
              min={1-B.tempoRange}
              max={1+B.tempoRange}
              step=".001"
              value={B.rate}
              onChange={event => patch('B',{rate:Number(event.target.value)})}
            />

            <input
              className={`${styles.verticalRange} ${styles.channelA}`}
              type="range"
              min="0"
              max="1"
              step=".01"
              value={A.channel}
              onChange={event => patch('A',{channel:Number(event.target.value)})}
            />

            <input
              className={`${styles.verticalRange} ${styles.channelB}`}
              type="range"
              min="0"
              max="1"
              step=".01"
              value={B.channel}
              onChange={event => patch('B',{channel:Number(event.target.value)})}
            />

            <input
              className={styles.crossfader}
              type="range"
              min="-1"
              max="1"
              step=".01"
              value={crossfader}
              onChange={event => setCrossfader(Number(event.target.value))}
            />

            <button
              className={styles.storeCueA}
              onDoubleClick={() => storeCue('A')}
              aria-label="Store cue A"
            />

            <button
              className={styles.storeCueB}
              onDoubleClick={() => storeCue('B')}
              aria-label="Store cue B"
            />
          </div>
        </div>

        <button className={styles.report}>⚑</button>

        <nav className={styles.dock}>
          <button onClick={() => setLibraryOpen(value => !value)}>
            ♫ Music Library
          </button>

          <button className={styles.selected}>
            ♬ DDJ-FLX4
          </button>

          <button onClick={() => setSettingsOpen(value => !value)}>
            ⚙ Settings
          </button>
        </nav>

        <div className={styles.brand}>
          HER9AL <small>Web DJ</small>
        </div>

        {libraryOpen && (
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div>
                <small>HER9AL</small>
                <h2>Music Library</h2>
              </div>

              <button onClick={() => setLibraryOpen(false)}>
                ×
              </button>
            </div>

            <input
              className={styles.search}
              placeholder="Search tracks..."
              value={query}
              onChange={event => setQuery(event.target.value)}
            />

            <div className={styles.localButtons}>
              <button onClick={() => fileA.current?.click()}>
                Load local → Deck A
              </button>

              <button onClick={() => fileB.current?.click()}>
                Load local → Deck B
              </button>
            </div>

            <div className={styles.trackList}>
              {filteredTracks.map((track,index) => (
                <div className={styles.trackRow} key={track.id || index}>
                  <div>
                    <b>{track.title}</b>
                    <span>
                      {track.artist || 'HER9AL'} · {track.bpm || 126} BPM
                    </span>
                  </div>

                  <button onClick={() => loadTrack('A',track)}>
                    LOAD A
                  </button>

                  <button onClick={() => loadTrack('B',track)}>
                    LOAD B
                  </button>
                </div>
              ))}

              {!filteredTracks.length && (
                <p>
                  No published DJ tracks yet. You can load a local audio file.
                </p>
              )}
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

              <button onClick={() => setSettingsOpen(false)}>
                ×
              </button>
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

            <label>
              Beat FX depth
              <input
                type="range"
                min="0"
                max="1"
                step=".01"
                value={fxDepth}
                onChange={event => setFxDepth(Number(event.target.value))}
              />
            </label>

            <div className={styles.status}>
              <span>Deck A pad mode</span><b>{A.padMode}</b>
              <span>Deck B pad mode</span><b>{B.padMode}</b>
              <span>FX</span><b>{fxType} · {fxBeat} beat</b>
              <span>CUE 1</span><b>{A.cueMonitor?'ON':'OFF'}</b>
              <span>CUE 2</span><b>{B.cueMonitor?'ON':'OFF'}</b>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
