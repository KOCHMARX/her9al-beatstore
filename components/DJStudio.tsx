'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { Disc3, FolderOpen, Gauge, Headphones, Link2, ListMusic, Pause, Play, RotateCcw, Search, SlidersHorizontal, Upload, Volume2 } from 'lucide-react';

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
  trim: number;
  high: number;
  mid: number;
  low: number;
  filter: number;
  channel: number;
  cue: number;
  loopIn: number | null;
  loopOut: number | null;
  loop: boolean;
  pads: Array<number | null>;
  peaks: number[];
};

const emptyDeck = (): DeckState => ({
  track: null, playing: false, currentTime: 0, duration: 0, bpm: 120, tempo: 0,
  trim: 0.85, high: 0, mid: 0, low: 0, filter: 0, channel: 0.9, cue: 0,
  loopIn: null, loopOut: null, loop: false, pads: Array(8).fill(null), peaks: Array(72).fill(0.25),
});

function fmt(n: number) {
  if (!Number.isFinite(n)) return '0:00';
  const m = Math.floor(n / 60), s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Knob({ label, value, min=-1, max=1, onChange }: { label:string; value:number; min?:number; max?:number; onChange:(v:number)=>void }) {
  const pct = (value - min) / (max - min);
  return <label className="dj-knob-wrap"><span>{label}</span><input className="dj-knob" type="range" min={min} max={max} step="0.01" value={value} onChange={e=>onChange(Number(e.target.value))}/><b>{Math.round(pct*100)}%</b></label>;
}

function MiniWave({ peaks, progress, onSeek }: { peaks:number[]; progress:number; onSeek:(ratio:number)=>void }) {
  return <button className="dj-wave" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();onSeek((e.clientX-r.left)/r.width)}}>
    {peaks.map((p,i)=><i key={i} className={i/peaks.length<=progress?'played':''} style={{height:`${Math.max(10,p*100)}%`}}/>)}
  </button>;
}

function Deck({ side, state, setState, audioRef, onLoadLocal, onSync }: {
  side:'A'|'B'; state:DeckState; setState:Dispatch<SetStateAction<DeckState>>; audioRef:RefObject<HTMLAudioElement|null>;
  onLoadLocal:(file:File)=>void; onSync:()=>void;
}) {
  const seek = (s:number) => { if(audioRef.current){audioRef.current.currentTime=Math.max(0,Math.min(s,audioRef.current.duration||s));setState(x=>({...x,currentTime:audioRef.current?.currentTime||0}))}};
  const toggle = async()=>{const a=audioRef.current;if(!a||!state.track?.audio_url)return;if(a.paused){try{await a.play()}catch{}}else a.pause()};
  const setCue=()=>setState(x=>({...x,cue:x.currentTime}));
  const cuePlay=()=>{seek(state.cue); audioRef.current?.pause();};
  const setLoopIn=()=>setState(x=>({...x,loopIn:x.currentTime}));
  const setLoopOut=()=>setState(x=>({...x,loopOut:x.currentTime,loop:x.loopIn!==null&&x.currentTime>(x.loopIn||0)}));
  const fourBeat=()=>{const bpm=state.bpm||120;const len=60/bpm*4;setState(x=>({...x,loopIn:x.currentTime,loopOut:x.currentTime+len,loop:true}))};
  const pad=(i:number)=>{const v=state.pads[i];if(v==null){setState(x=>({...x,pads:x.pads.map((p,k)=>k===i?x.currentTime:p)}))}else seek(v)};
  const progress=state.duration?state.currentTime/state.duration:0;
  const cover=state.track?.cover_url||'/her9al-logo.jpg';
  return <section className={`dj-deck dj-deck-${side.toLowerCase()}`}>
    <div className="dj-deck-top">
      <div><span>DECK {side}</span><strong>{state.track?.title||'Load a track'}</strong><small>{state.track?.artist||'HER9AL DJ Studio'}</small></div>
      <label className="dj-local-btn"><Upload size={15}/> LOCAL<input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&onLoadLocal(e.target.files[0])}/></label>
    </div>
    <MiniWave peaks={state.peaks} progress={progress} onSeek={r=>seek(r*(state.duration||0))}/>
    <div className="dj-time-row"><span>{fmt(state.currentTime)}</span><span>{state.bpm.toFixed(1)} BPM</span><span>-{fmt(Math.max(0,state.duration-state.currentTime))}</span></div>
    <div className="dj-deck-body">
      <div className={`dj-platter ${state.playing?'spin':''}`} onPointerMove={e=>{if(e.buttons===1&&state.duration)seek(state.currentTime+e.movementX*.03)}}>
        <div className="dj-platter-ring"><img src={cover} alt="cover"/><div className="dj-spindle"/></div>
      </div>
      <div className="dj-tempo">
        <span>TEMPO</span>
        <input type="range" min="-16" max="16" step="0.1" value={state.tempo} onChange={e=>setState(x=>({...x,tempo:Number(e.target.value)}))}/>
        <b>{state.tempo>0?'+':''}{state.tempo.toFixed(1)}%</b>
      </div>
    </div>
    <div className="dj-transport">
      <button className="cue" onClick={cuePlay} onDoubleClick={setCue}>CUE</button>
      <button className="play" onClick={toggle}>{state.playing?<Pause/>:<Play fill="currentColor"/>}</button>
      <button onClick={onSync}>BEAT<br/>SYNC</button>
    </div>
    <div className="dj-loop-row">
      <button className={state.loopIn!==null?'on':''} onClick={setLoopIn}>IN</button>
      <button className={state.loopOut!==null?'on':''} onClick={setLoopOut}>OUT</button>
      <button className={state.loop?'on':''} onClick={fourBeat}>4 BEAT</button>
      <button onClick={()=>setState(x=>({...x,loop:!x.loop}))}>EXIT</button>
      <button onClick={()=>seek(state.currentTime-(60/state.bpm)*4)}>◀ BEAT</button>
      <button onClick={()=>seek(state.currentTime+(60/state.bpm)*4)}>BEAT ▶</button>
    </div>
    <div className="dj-pad-labels"><span>HOT CUE</span><span>PAD FX</span><span>BEAT JUMP</span><span>SAMPLER</span></div>
    <div className="dj-pads">{state.pads.map((p,i)=><button key={i} className={p!==null?'set':''} onClick={()=>pad(i)}>{i+1}</button>)}</div>
    <div className="dj-hint">Double-click CUE to set cue · drag jog to nudge/seek · first pad press saves a hot cue.</div>
  </section>;
}

export default function DJStudio() {
  const [userOk,setUserOk]=useState<boolean|null>(null);
  const [library,setLibrary]=useState<DJTrack[]>([]);
  const [query,setQuery]=useState('');
  const [deckA,setDeckA]=useState<DeckState>(emptyDeck());
  const [deckB,setDeckB]=useState<DeckState>(emptyDeck());
  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(0.9);
  const [fxOn,setFxOn]=useState(false);
  const [smartFade,setSmartFade]=useState(false);
  const [soundcloud,setSoundcloud]=useState('');
  const audioA=useRef<HTMLAudioElement|null>(null), audioB=useRef<HTMLAudioElement|null>(null);
  const ctxRef=useRef<AudioContext|null>(null);
  const nodes=useRef<any>({});

  useEffect(()=>{
    fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json()).then(j=>{
      if(!j.user){location.href='/login?next=/dj';return;} setUserOk(true);
    }).catch(()=>location.href='/login?next=/dj');
    fetch('/api/dj/library',{cache:'no-store'}).then(async r=>{if(r.ok)setLibrary((await r.json()).tracks||[])}).catch(()=>{});
  },[]);

  const setupAudio=useCallback((audio:HTMLAudioElement, key:'A'|'B')=>{
    if(nodes.current[key])return;
    const Ctx=window.AudioContext||(window as any).webkitAudioContext;
    const ctx=ctxRef.current||(ctxRef.current=new Ctx());
    const src=ctx.createMediaElementSource(audio);
    const low=ctx.createBiquadFilter();low.type='lowshelf';low.frequency.value=250;
    const mid=ctx.createBiquadFilter();mid.type='peaking';mid.frequency.value=1200;mid.Q.value=.8;
    const high=ctx.createBiquadFilter();high.type='highshelf';high.frequency.value=4000;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=22000;
    const gain=ctx.createGain();
    src.connect(low).connect(mid).connect(high).connect(filter).connect(gain).connect(ctx.destination);
    nodes.current[key]={src,low,mid,high,filter,gain};
  },[]);

  const bindAudio=(audio:HTMLAudioElement|null,key:'A'|'B',setState:Dispatch<SetStateAction<DeckState>>)=>{
    if(!audio)return; setupAudio(audio,key);
    const t=()=>setState(x=>({...x,currentTime:audio.currentTime||0,duration:Number.isFinite(audio.duration)?audio.duration:x.duration}));
    const p=()=>setState(x=>({...x,playing:true})); const q=()=>setState(x=>({...x,playing:false}));
    audio.ontimeupdate=t;audio.onloadedmetadata=t;audio.ondurationchange=t;audio.onplay=p;audio.onpause=q;audio.onended=q;
  };

  useEffect(()=>{bindAudio(audioA.current,'A',setDeckA);bindAudio(audioB.current,'B',setDeckB)},[setupAudio]);

  const applyDeck=(key:'A'|'B',d:DeckState,a:HTMLAudioElement|null)=>{
    const n=nodes.current[key];if(!n||!a)return;
    a.playbackRate=Math.max(.5,Math.min(1.5,1+d.tempo/100));
    n.low.gain.value=d.low*12;n.mid.gain.value=d.mid*12;n.high.gain.value=d.high*12;
    n.filter.type=d.filter<0?'lowpass':'highpass';const f=Math.abs(d.filter);n.filter.frequency.value=f<.03?22000:(d.filter<0?22000-(f*20500):30+(f*12000));
  };
  useEffect(()=>applyDeck('A',deckA,audioA.current),[deckA.tempo,deckA.low,deckA.mid,deckA.high,deckA.filter]);
  useEffect(()=>applyDeck('B',deckB,audioB.current),[deckB.tempo,deckB.low,deckB.mid,deckB.high,deckB.filter]);

  useEffect(()=>{
    const a=nodes.current.A?.gain,b=nodes.current.B?.gain; if(!a||!b)return;
    const left=Math.cos((cross+1)*Math.PI/4), right=Math.sin((cross+1)*Math.PI/4);
    a.gain.value=deckA.channel*deckA.trim*master*left; b.gain.value=deckB.channel*deckB.trim*master*right;
  },[cross,master,deckA.channel,deckA.trim,deckB.channel,deckB.trim]);

  useEffect(()=>{
    const loop=(a:HTMLAudioElement|null,d:DeckState)=>{if(a&&d.loop&&d.loopIn!==null&&d.loopOut!==null&&a.currentTime>=d.loopOut)a.currentTime=d.loopIn};
    const id=setInterval(()=>{loop(audioA.current,deckA);loop(audioB.current,deckB)},30);return()=>clearInterval(id);
  },[deckA.loop,deckA.loopIn,deckA.loopOut,deckB.loop,deckB.loopIn,deckB.loopOut]);

  const peaksFromUrl=async(url:string)=>{try{const ctx=ctxRef.current||new AudioContext();const buf=await fetch(url).then(r=>r.arrayBuffer());const dec=await ctx.decodeAudioData(buf.slice(0));const data=dec.getChannelData(0), bins=72, step=Math.max(1,Math.floor(data.length/bins));return Array.from({length:bins},(_,i)=>{let m=0;for(let j=i*step;j<Math.min(data.length,(i+1)*step);j+=Math.max(1,Math.floor(step/150)))m=Math.max(m,Math.abs(data[j]));return Math.max(.08,m)})}catch{return Array.from({length:72},(_,i)=>.2+((i*37)%60)/100)}};
  const loadTrack=async(side:'A'|'B',track:DJTrack)=>{
    if(track.source_type==='soundcloud'||!track.audio_url){if(track.soundcloud_url)setSoundcloud(track.soundcloud_url);return;}
    const a=side==='A'?audioA.current:audioB.current, set=side==='A'?setDeckA:setDeckB;if(!a)return;
    a.pause();a.src=track.audio_url;a.load();const peaks=await peaksFromUrl(track.audio_url);set(x=>({...emptyDeck(),track,bpm:Number(track.bpm)||120,peaks}));
  };
  const loadLocal=async(side:'A'|'B',file:File)=>{const url=URL.createObjectURL(file);await loadTrack(side,{id:`local:${Date.now()}`,title:file.name.replace(/\.[^.]+$/,''),artist:'Local file',audio_url:url,cover_url:'/her9al-logo.jpg',source_type:'local'})};
  const sync=(from:'A'|'B')=>{const src=from==='A'?deckA:deckB,target=from==='A'?deckB:deckA,set=from==='A'?setDeckA:setDeckB;if(!src.bpm||!target.bpm)return;const targetRate=((src.bpm/target.bpm)-1)*100;set(x=>({...x,tempo:Math.max(-16,Math.min(16,targetRate))}))};

  const filtered=useMemo(()=>library.filter(t=>`${t.title} ${t.artist||''} ${t.meta||''}`.toLowerCase().includes(query.toLowerCase())),[library,query]);
  if(userOk===null)return <div className="dj-loading">Loading DJ Studio…</div>;

  return <div className="dj-studio-shell">
    <audio ref={r=>{audioA.current=r; if(r)bindAudio(r,'A',setDeckA)}} crossOrigin="anonymous"/>
    <audio ref={r=>{audioB.current=r; if(r)bindAudio(r,'B',setDeckB)}} crossOrigin="anonymous"/>
    <div className="dj-toolbar"><div><Disc3/><b>HER9AL DJ</b><span>WEB MIXER</span></div><div className="dj-live-dot">● ACCOUNT MODE</div></div>
    <div className="dj-console">
      <Deck side="A" state={deckA} setState={setDeckA} audioRef={audioA} onLoadLocal={f=>loadLocal('A',f)} onSync={()=>sync('A')}/>
      <section className="dj-mixer">
        <div className="dj-mixer-head"><SlidersHorizontal/><b>MIXER</b></div>
        <div className="dj-mixer-cols">
          <div className="dj-channel"><Knob label="TRIM" value={deckA.trim} min={0} max={1.4} onChange={v=>setDeckA(x=>({...x,trim:v}))}/><Knob label="HI" value={deckA.high} onChange={v=>setDeckA(x=>({...x,high:v}))}/><Knob label="MID" value={deckA.mid} onChange={v=>setDeckA(x=>({...x,mid:v}))}/><Knob label="LOW" value={deckA.low} onChange={v=>setDeckA(x=>({...x,low:v}))}/><Knob label="CFX" value={deckA.filter} onChange={v=>setDeckA(x=>({...x,filter:v}))}/><input className="dj-fader" type="range" min="0" max="1" step=".01" value={deckA.channel} onChange={e=>setDeckA(x=>({...x,channel:Number(e.target.value)}))}/></div>
          <div className="dj-master"><Knob label="MASTER" value={master} min={0} max={1} onChange={setMaster}/><div className="dj-meters"><i/><i/><i/><i/><i/><i/></div><button className={fxOn?'active':''} onClick={()=>setFxOn(!fxOn)}>BEAT FX</button><button className={smartFade?'active':''} onClick={()=>setSmartFade(!smartFade)}>SMART FADER</button><Headphones size={20}/></div>
          <div className="dj-channel"><Knob label="TRIM" value={deckB.trim} min={0} max={1.4} onChange={v=>setDeckB(x=>({...x,trim:v}))}/><Knob label="HI" value={deckB.high} onChange={v=>setDeckB(x=>({...x,high:v}))}/><Knob label="MID" value={deckB.mid} onChange={v=>setDeckB(x=>({...x,mid:v}))}/><Knob label="LOW" value={deckB.low} onChange={v=>setDeckB(x=>({...x,low:v}))}/><Knob label="CFX" value={deckB.filter} onChange={v=>setDeckB(x=>({...x,filter:v}))}/><input className="dj-fader" type="range" min="0" max="1" step=".01" value={deckB.channel} onChange={e=>setDeckB(x=>({...x,channel:Number(e.target.value)}))}/></div>
        </div>
        <label className="dj-cross"><span>A</span><input type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/><span>B</span></label>
      </section>
      <Deck side="B" state={deckB} setState={setDeckB} audioRef={audioB} onLoadLocal={f=>loadLocal('B',f)} onSync={()=>sync('B')}/>
    </div>

    <div className="dj-bottom-grid">
      <section className="dj-library-panel"><div className="dj-panel-title"><ListMusic/><div><b>DJ Library</b><span>HER9AL beats + admin DJ tracks + local files</span></div></div><label className="dj-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tracks, artist, style…"/></label><div className="dj-track-list">{filtered.map(t=><div className="dj-track-row" key={t.id}><img src={t.cover_url||'/her9al-logo.jpg'} alt=""/><div><b>{t.title}</b><span>{t.artist||'HER9AL'} · {t.bpm||'—'} BPM · {t.meta||t.source_type}</span></div><button onClick={()=>loadTrack('A',t)}>LOAD A</button><button onClick={()=>loadTrack('B',t)}>LOAD B</button></div>)}{!filtered.length&&<p>No tracks found.</p>}</div></section>
      <section className="dj-sc-panel"><div className="dj-panel-title"><Link2/><div><b>SoundCloud source</b><span>Paste a public SoundCloud track or playlist URL</span></div></div><div className="dj-sc-form"><input value={soundcloud} onChange={e=>setSoundcloud(e.target.value)} placeholder="https://soundcloud.com/artist/track"/><button onClick={()=>setSoundcloud(x=>x.trim())}>LOAD</button></div>{soundcloud.startsWith('http')?<iframe title="SoundCloud source" allow="autoplay" src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloud)}&color=%23ff5b22&auto_play=false&show_artwork=true&single_active=false`}/>:<div className="dj-sc-empty">SoundCloud uses its official embedded player. Use HER9AL/local tracks in the decks for tempo, EQ, loops and scratch-style controls.</div>}</section>
    </div>
    <section className="dj-guide"><div className="dj-panel-title"><Gauge/><div><b>Controller guide</b><span>Quick map of the web controls</span></div></div><div className="dj-guide-grid"><div className="dj-guide-card"><b>PLAY / PAUSE</b><p>Starts or pauses the loaded deck.</p></div><div className="dj-guide-card"><b>CUE</b><p>Double-click to set a cue; click to return to it.</p></div><div className="dj-guide-card"><b>JOG</b><p>Drag left/right to nudge or seek through the track.</p></div><div className="dj-guide-card"><b>IN / OUT / 4 BEAT</b><p>Creates loops and exits them without stopping playback.</p></div><div className="dj-guide-card"><b>BEAT SYNC</b><p>Matches the other deck tempo using BPM metadata.</p></div><div className="dj-guide-card"><b>TRIM + EQ</b><p>Controls gain plus high, mid and low frequency bands.</p></div><div className="dj-guide-card"><b>CFX</b><p>Acts as a high-pass / low-pass filter around the center.</p></div><div className="dj-guide-card"><b>CROSSFADER</b><p>Blends Deck A and Deck B with equal-power fading.</p></div><div className="dj-guide-card"><b>HOT CUES</b><p>First press stores the position; later presses jump back.</p></div><div className="dj-guide-card"><b>TEMPO</b><p>Changes playback speed within a ±16% range.</p></div><div className="dj-guide-card"><b>LOCAL</b><p>Loads an audio file from the device without uploading it.</p></div><div className="dj-guide-card"><b>SOUNDCLOUD</b><p>Uses SoundCloud’s official embedded player for public links.</p></div></div></section>
  </div>;
}
