'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A' | 'B';
type PadMode = 'hotcue' | 'padfx' | 'beatjump' | 'sampler';

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
  peaks: number[];
  hotCues: Array<number | null>;
  padMode: PadMode;
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

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

const freshDeck=():Deck=>({
  track:null,
  title:'NO TRACK LOADED',
  artist:'HER9AL',
  bpm:126,
  playing:false,
  time:0,
  duration:0,
  cue:0,
  rate:1,
  channel:.88,
  loopIn:null,
  loopOut:null,
  peaks:[],
  hotCues:Array(8).fill(null),
  padMode:'hotcue'
});

function fmt(v:number){
  if(!Number.isFinite(v))return '00:00';
  const m=Math.floor(v/60),s=Math.floor(v%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function Waveform({peaks,progress}:{peaks:number[],progress:number}){
  const ref=useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const c=ref.current;
    if(!c)return;

    const rect=c.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    c.width=Math.max(1,Math.round(rect.width*dpr));
    c.height=Math.max(1,Math.round(rect.height*dpr));

    const ctx=c.getContext('2d');
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,rect.width,rect.height);

    const source=peaks.length
      ?peaks
      :Array.from({length:240},(_,i)=>.10+.52*Math.abs(Math.sin(i*.283)*Math.cos(i*.071)));

    const w=rect.width/source.length;
    const center=rect.height/2;

    source.forEach((p,i)=>{
      const h=Math.max(1,p*rect.height*.86);
      const active=i/source.length<=progress;
      ctx.fillStyle=active?'#55aaff':'#265a84';
      ctx.fillRect(i*w,center-h/2,Math.max(1,w*.66),h);
    });
  },[peaks,progress]);

  return <canvas className={styles.waveCanvas} ref={ref}/>;
}

export default function DJStudio(){
  const audioA=useRef<HTMLAudioElement>(null);
  const audioB=useRef<HTMLAudioElement>(null);
  const fileA=useRef<HTMLInputElement>(null);
  const fileB=useRef<HTMLInputElement>(null);
  const jogARef=useRef<HTMLImageElement>(null);
  const jogBRef=useRef<HTMLImageElement>(null);

  const contextRef=useRef<AudioContext|null>(null);
  const masterGainRef=useRef<GainNode|null>(null);
  const nodesA=useRef<Nodes|null>(null);
  const nodesB=useRef<Nodes|null>(null);

  const jogOffsetA=useRef(0);
  const jogOffsetB=useRef(0);
  const raf=useRef<number|null>(null);

  const [loading,setLoading]=useState(true);
  const [loadingPct,setLoadingPct]=useState(0);

  const [A,setA]=useState<Deck>(freshDeck());
  const [B,setB]=useState<Deck>(freshDeck());
  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(.92);
  const [fxOn,setFxOn]=useState(false);
  const [fxDepth,setFxDepth]=useState(.28);
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [tracks,setTracks]=useState<Track[]>([]);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState<Record<string,boolean>>({});
  const [angles,setAngles]=useState<Record<string,number>>({
    trimA:0,trimB:0,hiA:0,hiB:0,midA:0,midB:0,
    lowA:0,lowB:0,filterA:0,filterB:0,master:0,fx:0,
    mic:0,mix:0,level:0
  });

  const audio=(d:DeckId)=>d==='A'?audioA.current:audioB.current;
  const deck=(d:DeckId)=>d==='A'?A:B;
  const nodes=(d:DeckId)=>d==='A'?nodesA.current:nodesB.current;
  const patch=(d:DeckId,p:Partial<Deck>)=>d==='A'?setA(v=>({...v,...p})):setB(v=>({...v,...p}));

  useEffect(()=>{
    let cancelled=false;
    const run=async()=>{
      const steps=[15,34,52,71,88,100];
      for(const pct of steps){
        if(cancelled)return;
        setLoadingPct(pct);
        await new Promise(r=>setTimeout(r,pct===100?260:120));
      }
      if(!cancelled)setLoading(false);
    };
    run();
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    fetch('/api/auth/session',{cache:'no-store'})
      .then(r=>{if(r.status===401)window.location.href='/login'})
      .catch(()=>{});
  },[]);

  useEffect(()=>{
    fetch('/api/dj/tracks',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(j=>{
        const list=(j?.tracks||[]).map((t:any)=>({
          id:t.id,
          title:t.title,
          artist:t.artist||'HER9AL',
          url:t.audio_url||t.url,
          bpm:Number(t.bpm)||126
        })).filter((t:any)=>t.url);
        setTracks(list);
      })
      .catch(()=>{});
  },[]);

  const flash=(id:string,ms=160)=>{
    setActive(v=>({...v,[id]:true}));
    window.setTimeout(()=>setActive(v=>({...v,[id]:false})),ms);
  };

  const ensureGraph=async()=>{
    if(!audioA.current||!audioB.current)return;

    if(!contextRef.current){
      const ctx=new AudioContext();
      contextRef.current=ctx;

      const masterGain=ctx.createGain();
      masterGain.gain.value=master;
      masterGain.connect(ctx.destination);
      masterGainRef.current=masterGain;

      const make=(media:HTMLMediaElement):Nodes=>{
        const source=ctx.createMediaElementSource(media);
        const trim=ctx.createGain();

        const low=ctx.createBiquadFilter();
        low.type='lowshelf';low.frequency.value=240;

        const mid=ctx.createBiquadFilter();
        mid.type='peaking';mid.frequency.value=1200;mid.Q.value=.8;

        const high=ctx.createBiquadFilter();
        high.type='highshelf';high.frequency.value=4800;

        const filter=ctx.createBiquadFilter();
        filter.type='lowpass';filter.frequency.value=20000;

        const dry=ctx.createGain();
        const delay=ctx.createDelay(2);
        const feedback=ctx.createGain();
        const wet=ctx.createGain();
        const channel=ctx.createGain();
        const crossNode=ctx.createGain();

        dry.gain.value=1;
        wet.gain.value=0;
        delay.delayTime.value=.28;
        feedback.gain.value=.27;
        channel.gain.value=.88;

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

        channel.connect(crossNode);
        crossNode.connect(masterGain);

        return{source,trim,low,mid,high,filter,dry,delay,feedback,wet,channel,cross:crossNode};
      };

      nodesA.current=make(audioA.current);
      nodesB.current=make(audioB.current);
    }

    if(contextRef.current.state==='suspended'){
      await contextRef.current.resume();
    }
  };

  useEffect(()=>{
    if(masterGainRef.current)masterGainRef.current.gain.value=master;
  },[master]);

  useEffect(()=>{
    if(nodesA.current)nodesA.current.channel.gain.value=A.channel;
    if(nodesB.current)nodesB.current.channel.gain.value=B.channel;
  },[A.channel,B.channel]);

  useEffect(()=>{
    const left=cross<=0?1:1-cross;
    const right=cross>=0?1:1+cross;
    if(nodesA.current)nodesA.current.cross.gain.value=left;
    if(nodesB.current)nodesB.current.cross.gain.value=right;
  },[cross]);

  useEffect(()=>{
    if(audioA.current)audioA.current.playbackRate=A.rate;
  },[A.rate]);

  useEffect(()=>{
    if(audioB.current)audioB.current.playbackRate=B.rate;
  },[B.rate]);

  useEffect(()=>{
    for(const n of [nodesA.current,nodesB.current]){
      if(!n)continue;
      n.wet.gain.value=fxOn?fxDepth:0;
      n.dry.gain.value=fxOn?1-fxDepth*.4:1;
    }
  },[fxOn,fxDepth]);

  // Jog wheels rotate continuously from currentTime while audio plays.
  useEffect(()=>{
    const tick=()=>{
      const a=audioA.current;
      const b=audioB.current;

      if(jogARef.current){
        const angle=(a?.currentTime||0)*180+jogOffsetA.current;
        jogARef.current.style.transform=`rotate(${angle}deg)`;
      }

      if(jogBRef.current){
        const angle=(b?.currentTime||0)*180+jogOffsetB.current;
        jogBRef.current.style.transform=`rotate(${angle}deg)`;
      }

      raf.current=requestAnimationFrame(tick);
    };

    raf.current=requestAnimationFrame(tick);

    return()=>{
      if(raf.current!==null)cancelAnimationFrame(raf.current);
    };
  },[]);

  const makePeaks=async(file:File)=>{
    try{
      const ctx=contextRef.current||new AudioContext();
      const data=await file.arrayBuffer();
      const buffer=await ctx.decodeAudioData(data.slice(0));
      const channel=buffer.getChannelData(0);
      const bins=320;
      const size=Math.max(1,Math.floor(channel.length/bins));
      const out:number[]=[];

      for(let i=0;i<bins;i++){
        let max=0;
        const start=i*size;
        const end=Math.min(channel.length,start+size);
        const step=Math.max(1,Math.floor(size/64));

        for(let j=start;j<end;j+=step){
          max=Math.max(max,Math.abs(channel[j]));
        }

        out.push(Math.max(.025,max));
      }

      return out;
    }catch{
      return [];
    }
  };

  const loadLocal=async(d:DeckId,file:File)=>{
    await ensureGraph();
    const peaks=await makePeaks(file);
    const url=URL.createObjectURL(file);

    patch(d,{
      track:{title:file.name,artist:'Local file',url,bpm:126},
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
      hotCues:Array(8).fill(null)
    });

    if(d==='A')jogOffsetA.current=0;
    else jogOffsetB.current=0;

    setLibraryOpen(false);
    window.setTimeout(()=>audio(d)?.load(),0);
  };

  const loadTrack=async(d:DeckId,t:Track)=>{
    await ensureGraph();
    patch(d,{
      track:t,
      title:t.title,
      artist:t.artist||'HER9AL',
      bpm:t.bpm||126,
      playing:false,
      time:0,
      duration:0,
      cue:0,
      rate:1,
      loopIn:null,
      loopOut:null,
      peaks:[],
      hotCues:Array(8).fill(null)
    });

    if(d==='A')jogOffsetA.current=0;
    else jogOffsetB.current=0;

    setLibraryOpen(false);
    window.setTimeout(()=>audio(d)?.load(),0);
  };

  const playPause=async(d:DeckId)=>{
    await ensureGraph();
    const a=audio(d);
    if(!a||!deck(d).track)return;

    flash(`play${d}`,220);

    if(a.paused){
      await a.play();
      patch(d,{playing:true});
    }else{
      a.pause();
      patch(d,{playing:false});
    }
  };

  const cue=(d:DeckId)=>{
    const a=audio(d);
    if(!a)return;
    a.pause();
    a.currentTime=deck(d).cue;
    patch(d,{playing:false});
    flash(`cue${d}`,220);
  };

  const saveCue=(d:DeckId)=>{
    const a=audio(d);
    if(!a)return;
    patch(d,{cue:a.currentTime});
    flash(`cue${d}`,420);
  };

  const loopIn=(d:DeckId)=>{
    const a=audio(d);
    if(!a)return;
    patch(d,{loopIn:a.currentTime});
    flash(`in${d}`,180);
  };

  const loopOut=(d:DeckId)=>{
    const a=audio(d);
    if(!a)return;

    const start=deck(d).loopIn??Math.max(0,a.currentTime-.5);
    patch(d,{
      loopIn:start,
      loopOut:Math.max(start+.05,a.currentTime)
    });

    flash(`out${d}`,180);
  };

  const fourBeat=(d:DeckId)=>{
    const a=audio(d);
    if(!a)return;
    const len=4*60/(deck(d).bpm||126);
    patch(d,{loopIn:a.currentTime,loopOut:a.currentTime+len});
    flash(`loop${d}`,260);
  };

  const clearLoop=(d:DeckId)=>patch(d,{loopIn:null,loopOut:null});

  const resizeLoop=(d:DeckId,factor:number)=>{
    const s=deck(d);
    if(s.loopIn===null||s.loopOut===null)return;
    patch(d,{loopOut:s.loopIn+Math.max(.05,(s.loopOut-s.loopIn)*factor)});
  };

  const sync=(d:DeckId)=>{
    const other=d==='A'?B:A;
    const target=other.bpm||126;
    patch(d,{
      bpm:target,
      rate:clamp(target/126,.84,1.16)
    });
    flash(`sync${d}`,260);
  };

  const timeUpdate=(d:DeckId)=>{
    const a=audio(d);
    if(!a)return;
    const s=deck(d);

    if(
      s.loopIn!==null &&
      s.loopOut!==null &&
      a.currentTime>=s.loopOut
    ){
      a.currentTime=s.loopIn;
    }

    patch(d,{
      time:a.currentTime,
      duration:a.duration||0
    });
  };

  const jogDrag=(d:DeckId)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    let previous=e.clientX;

    const move=(event:PointerEvent)=>{
      const dx=event.clientX-previous;
      previous=event.clientX;

      const a=audio(d);

      if(a&&Number.isFinite(a.duration)){
        a.currentTime=clamp(
          a.currentTime+dx*.024,
          0,
          a.duration
        );
      }

      if(d==='A')jogOffsetA.current+=dx*.9;
      else jogOffsetB.current+=dx*.9;
    };

    const up=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };

    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const applyKnob=(id:string,angle:number)=>{
    const norm=(angle+135)/270;
    const bipolar=norm*2-1;

    const d:DeckId|null=
      id.endsWith('A')?'A':
      id.endsWith('B')?'B':
      null;

    const n=d?nodes(d):null;

    if(id.startsWith('trim')&&n){
      n.trim.gain.value=.2+norm*1.8;
    }

    if(id.startsWith('low')&&n){
      n.low.gain.value=bipolar*12;
    }

    if(id.startsWith('mid')&&n){
      n.mid.gain.value=bipolar*12;
    }

    if(id.startsWith('hi')&&n){
      n.high.gain.value=bipolar*12;
    }

    if(id.startsWith('filter')&&n){
      if(bipolar<0){
        n.filter.type='lowpass';
        n.filter.frequency.value=
          20000*Math.pow(.025,-bipolar);
      }else{
        n.filter.type='highpass';
        n.filter.frequency.value=
          30*Math.pow(300,bipolar);
      }
    }

    if(id==='master')setMaster(norm);
    if(id==='fx')setFxDepth(norm);
  };

  const knobDrag=(id:string)=>async(e:React.PointerEvent<HTMLDivElement>)=>{
    await ensureGraph();

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const startY=e.clientY;
    const start=angles[id]||0;

    const move=(event:PointerEvent)=>{
      const angle=clamp(
        start+(startY-event.clientY)*1.05,
        -135,
        135
      );

      setAngles(v=>({...v,[id]:angle}));
      applyKnob(id,angle);
    };

    const up=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };

    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const usePad=(d:DeckId,index:number)=>{
    const a=audio(d);
    if(!a)return;

    const s=deck(d);

    if(s.padMode==='hotcue'){
      const cues=[...s.hotCues];

      if(cues[index]===null){
        cues[index]=a.currentTime;
      }else{
        a.currentTime=cues[index] as number;
      }

      patch(d,{hotCues:cues});
    }

    if(s.padMode==='beatjump'){
      const beats=[-8,-4,-2,-1,1,2,4,8];
      const jump=beats[index]*60/(s.bpm||126);

      a.currentTime=clamp(
        a.currentTime+jump,
        0,
        a.duration||a.currentTime+jump
      );
    }

    if(s.padMode==='padfx'){
      setFxOn(true);
      window.setTimeout(()=>setFxOn(false),220);
    }

    if(s.padMode==='sampler'&&s.track?.url){
      const sample=new Audio(s.track.url);
      sample.volume=.6;
      sample.playbackRate=s.rate;
      sample.currentTime=s.hotCues[index]??s.cue??0;
      sample.play().catch(()=>{});
      window.setTimeout(()=>sample.pause(),360);
    }

    flash(`pad${d}${index}`,180);
  };

  const Hit=({
    id,x,y,w,h,onClick,round=false
  }:{
    id:string;
    x:number;
    y:number;
    w:number;
    h:number;
    onClick:()=>void;
    round?:boolean;
  })=>(
    <button
      className={`${styles.hit} ${round?styles.round:''} ${active[id]?styles.lit:''}`}
      style={{
        left:`${x}%`,
        top:`${y}%`,
        width:`${w}%`,
        height:`${h}%`
      }}
      onClick={onClick}
      aria-label={id}
    />
  );

  const Knob=({
    id,src,x,y,size
  }:{
    id:string;
    src:string;
    x:number;
    y:number;
    size:number;
  })=>(
    <div
      className={styles.knob}
      style={{
        left:`${x}%`,
        top:`${y}%`,
        width:`${size}%`
      }}
      onPointerDown={knobDrag(id)}
      aria-label={id}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          transform:`rotate(${angles[id]||0}deg)`
        }}
      />
    </div>
  );

  const progressA=A.duration?A.time/A.duration:0;
  const progressB=B.duration?B.time/B.duration:0;

  const filtered=tracks.filter(t=>
    `${t.title} ${t.artist||''}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main className={styles.page}>
      <audio
        ref={audioA}
        src={A.track?.url||''}
        onTimeUpdate={()=>timeUpdate('A')}
        onEnded={()=>patch('A',{playing:false})}
      />
      <audio
        ref={audioB}
        src={B.track?.url||''}
        onTimeUpdate={()=>timeUpdate('B')}
        onEnded={()=>patch('B',{playing:false})}
      />

      <input
        ref={fileA}
        hidden
        type="file"
        accept="audio/*"
        onChange={e=>e.target.files?.[0]&&loadLocal('A',e.target.files[0])}
      />
      <input
        ref={fileB}
        hidden
        type="file"
        accept="audio/*"
        onChange={e=>e.target.files?.[0]&&loadLocal('B',e.target.files[0])}
      />

      {loading&&(
        <div className={styles.loader}>
          <div className={styles.loaderInner}>
            <div className={styles.loaderDisc}>
              <span>H</span>
            </div>
            <small>HER9AL WEB DJ</small>
            <h1>Loading DJ Controller</h1>
            <div className={styles.loaderTrack}>
              <div style={{width:`${loadingPct}%`}}/>
            </div>
            <b>{loadingPct}%</b>
          </div>
        </div>
      )}

      <header className={styles.deckHeader}>
        <div className={styles.deckInfo}>
          <strong>{A.title}</strong>
          <span>{A.artist}</span>
          <div className={styles.stats}>
            <b>A</b>
            <em>{A.bpm} BPM</em>
            <i>{fmt(A.time)} / {fmt(A.duration)}</i>
          </div>
          <div className={styles.miniWave}>
            <Waveform peaks={A.peaks} progress={progressA}/>
          </div>
        </div>

        <div className={styles.mainWave}>
          <div className={styles.waveRow}>
            <Waveform peaks={A.peaks} progress={progressA}/>
          </div>
          <div className={styles.waveRow}>
            <Waveform peaks={B.peaks} progress={progressB}/>
          </div>
          <div className={styles.playhead}/>
          {[18,38,62,82].map(x=>
            <i key={x} style={{left:`${x}%`}}/>
          )}
        </div>

        <div className={`${styles.deckInfo} ${styles.deckRight}`}>
          <strong>{B.title}</strong>
          <span>{B.artist}</span>
          <div className={styles.stats}>
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
        <button onClick={()=>history.back()}>
          ← HER9AL
        </button>
        <strong>STUDIO</strong>
        <span>HER9AL WEB DJ</span>
      </div>

      <section className={styles.stage}>
        <div className={styles.controller}>
          <img
            src="/dj/flx4-4k.png"
            className={styles.base}
            alt="DDJ-FLX4"
          />

          <div
            className={`${styles.jog} ${styles.jogA}`}
            onPointerDown={jogDrag('A')}
          >
            <img ref={jogARef} src="/dj/jog-a.png" alt="" draggable={false}/>
          </div>

          <div
            className={`${styles.jog} ${styles.jogB}`}
            onPointerDown={jogDrag('B')}
          >
            <img ref={jogBRef} src="/dj/jog-b.png" alt="" draggable={false}/>
          </div>

          <Knob id="trimA" src="/dj/trim-a.png" x={42.9} y={18.4} size={4.6}/>
          <Knob id="trimB" src="/dj/trim-b.png" x={50.5} y={18.4} size={4.6}/>
          <Knob id="hiA" src="/dj/hi-a.png" x={42.9} y={26.5} size={4.6}/>
          <Knob id="hiB" src="/dj/hi-b.png" x={50.5} y={26.5} size={4.6}/>
          <Knob id="midA" src="/dj/mid-a.png" x={42.9} y={34.8} size={4.6}/>
          <Knob id="midB" src="/dj/mid-b.png" x={50.5} y={34.8} size={4.6}/>
          <Knob id="lowA" src="/dj/low-a.png" x={42.9} y={43.1} size={4.6}/>
          <Knob id="lowB" src="/dj/low-b.png" x={50.5} y={43.1} size={4.6}/>
          <Knob id="filterA" src="/dj/filter-a.png" x={42.9} y={51.9} size={4.6}/>
          <Knob id="filterB" src="/dj/filter-b.png" x={50.5} y={51.9} size={4.6}/>
          <Knob id="master" src="/dj/master.png" x={56.5} y={18.7} size={5.0}/>
          <Knob id="fx" src="/dj/fx-depth.png" x={56.5} y={73.0} size={5.0}/>

          {/* LOAD */}
          <Hit id="loadA" x={39.2} y={4.4} w={4.1} h={4.0} onClick={()=>fileA.current?.click()}/>
          <Hit id="loadB" x={51.9} y={4.4} w={4.1} h={4.0} onClick={()=>fileB.current?.click()}/>

          {/* Deck A top row */}
          <Hit id="inA" x={5.6} y={11.4} w={4.2} h={4.1} onClick={()=>loopIn('A')} round/>
          <Hit id="outA" x={10.6} y={11.4} w={4.2} h={4.1} onClick={()=>loopOut('A')} round/>
          <Hit id="loopA" x={15.7} y={11.0} w={7.0} h={4.4} onClick={()=>fourBeat('A')}/>
          <Hit id="syncA" x={25.4} y={10.6} w={4.4} h={4.7} onClick={()=>sync('A')} round/>

          {/* Deck B top row */}
          <Hit id="inB" x={69.2} y={11.4} w={4.2} h={4.1} onClick={()=>loopIn('B')} round/>
          <Hit id="outB" x={74.2} y={11.4} w={4.2} h={4.1} onClick={()=>loopOut('B')} round/>
          <Hit id="loopB" x={79.3} y={11.0} w={7.0} h={4.4} onClick={()=>fourBeat('B')}/>
          <Hit id="syncB" x={89.0} y={10.6} w={4.4} h={4.7} onClick={()=>sync('B')} round/>

          {/* loop call controls */}
          <Hit id="exitA" x={16.1} y={14.2} w={3.0} h={2.6} onClick={()=>clearLoop('A')}/>
          <Hit id="halfA" x={20.1} y={14.2} w={2.8} h={2.6} onClick={()=>resizeLoop('A',.5)}/>
          <Hit id="doubleA" x={23.0} y={14.2} w={2.8} h={2.6} onClick={()=>resizeLoop('A',2)}/>
          <Hit id="exitB" x={79.7} y={14.2} w={3.0} h={2.6} onClick={()=>clearLoop('B')}/>
          <Hit id="halfB" x={83.7} y={14.2} w={2.8} h={2.6} onClick={()=>resizeLoop('B',.5)}/>
          <Hit id="doubleB" x={86.6} y={14.2} w={2.8} h={2.6} onClick={()=>resizeLoop('B',2)}/>

          {/* transport */}
          <Hit id="cueA" x={3.2} y={76.3} w={5.6} h={7.6} onClick={()=>cue('A')} round/>
          <Hit id="playA" x={3.2} y={84.8} w={5.6} h={7.6} onClick={()=>playPause('A')} round/>
          <Hit id="cueB" x={66.8} y={76.3} w={5.6} h={7.6} onClick={()=>cue('B')} round/>
          <Hit id="playB" x={66.8} y={84.8} w={5.6} h={7.6} onClick={()=>playPause('B')} round/>

          {/* pad modes */}
          {(['hotcue','padfx','beatjump','sampler'] as PadMode[]).map((mode,i)=>
            <Hit key={`modeA-${mode}`} id={`modeA${mode}`}
              x={8.9+i*5.25} y={73.6} w={4.7} h={3.1}
              onClick={()=>patch('A',{padMode:mode})}/>
          )}
          {(['hotcue','padfx','beatjump','sampler'] as PadMode[]).map((mode,i)=>
            <Hit key={`modeB-${mode}`} id={`modeB${mode}`}
              x={72.5+i*5.25} y={73.6} w={4.7} h={3.1}
              onClick={()=>patch('B',{padMode:mode})}/>
          )}

          {/* performance pads */}
          {Array.from({length:8}).map((_,i)=>
            <Hit key={`padA-${i}`} id={`padA${i}`}
              x={8.9+(i%4)*5.25} y={78.0+Math.floor(i/4)*7.15}
              w={4.7} h={6.0} onClick={()=>usePad('A',i)}/>
          )}
          {Array.from({length:8}).map((_,i)=>
            <Hit key={`padB-${i}`} id={`padB${i}`}
              x={72.5+(i%4)*5.25} y={78.0+Math.floor(i/4)*7.15}
              w={4.7} h={6.0} onClick={()=>usePad('B',i)}/>
          )}

          {/* real fader zones, visually represented by controller-image caps */}
          <input
            className={`${styles.vRange} ${styles.tempoA}`}
            type="range" min=".84" max="1.16" step=".001"
            value={A.rate}
            onChange={e=>patch('A',{rate:Number(e.target.value)})}
          />
          <img className={styles.tempoCapA} src="/dj/tempo-cap-a.png" alt=""
            style={{top:`${65.8+(1-(A.rate-.84)/.32)*12}%`}}/>

          <input
            className={`${styles.vRange} ${styles.tempoB}`}
            type="range" min=".84" max="1.16" step=".001"
            value={B.rate}
            onChange={e=>patch('B',{rate:Number(e.target.value)})}
          />
          <img className={styles.tempoCapB} src="/dj/tempo-cap-b.png" alt=""
            style={{top:`${65.8+(1-(B.rate-.84)/.32)*12}%`}}/>

          <input
            className={`${styles.vRange} ${styles.channelA}`}
            type="range" min="0" max="1" step=".01"
            value={A.channel}
            onChange={e=>patch('A',{channel:Number(e.target.value)})}
          />
          <img className={styles.chCapA} src="/dj/ch-cap-a.png" alt=""
            style={{top:`${64.2+(1-A.channel)*13}%`}}/>

          <input
            className={`${styles.vRange} ${styles.channelB}`}
            type="range" min="0" max="1" step=".01"
            value={B.channel}
            onChange={e=>patch('B',{channel:Number(e.target.value)})}
          />
          <img className={styles.chCapB} src="/dj/ch-cap-b.png" alt=""
            style={{top:`${64.2+(1-B.channel)*13}%`}}/>

          <input
            className={styles.crossRange}
            type="range" min="-1" max="1" step=".01"
            value={cross}
            onChange={e=>setCross(Number(e.target.value))}
          />
          <img className={styles.crossCap} src="/dj/cross-cap.png" alt=""
            style={{left:`${45.0+((cross+1)/2)*8.0}%`}}/>

          {/* Beat FX */}
          <Hit id="fxOn" x={54.0} y={82.0} w={4.5} h={5.2} onClick={()=>setFxOn(v=>!v)} round/>

          <button
            className={styles.storeCueA}
            onDoubleClick={()=>saveCue('A')}
            aria-label="Store cue A"
          />
          <button
            className={styles.storeCueB}
            onDoubleClick={()=>saveCue('B')}
            aria-label="Store cue B"
          />
        </div>
      </section>

      <button className={styles.flag}>⚑</button>

      <nav className={styles.dock}>
        <button onClick={()=>setLibraryOpen(v=>!v)}>♫ Music Library</button>
        <button className={styles.selected}>♬ DDJ-FLX4</button>
        <button onClick={()=>setSettingsOpen(v=>!v)}>⚙ Settings</button>
      </nav>

      <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

      {libraryOpen&&(
        <aside className={styles.drawer}>
          <div className={styles.drawerHead}>
            <div>
              <small>HER9AL</small>
              <h2>Music Library</h2>
            </div>
            <button onClick={()=>setLibraryOpen(false)}>×</button>
          </div>

          <input
            className={styles.search}
            placeholder="Search tracks..."
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />

          <div className={styles.localLoad}>
            <button onClick={()=>fileA.current?.click()}>
              Load local file → Deck A
            </button>
            <button onClick={()=>fileB.current?.click()}>
              Load local file → Deck B
            </button>
          </div>

          <div className={styles.trackList}>
            {filtered.map((t,i)=>(
              <div className={styles.trackRow} key={t.id||i}>
                <div>
                  <b>{t.title}</b>
                  <span>{t.artist||'HER9AL'} · {t.bpm||126} BPM</span>
                </div>
                <button onClick={()=>loadTrack('A',t)}>LOAD A</button>
                <button onClick={()=>loadTrack('B',t)}>LOAD B</button>
              </div>
            ))}

            {!filtered.length&&(
              <p>No published DJ tracks yet. You can load a local audio file.</p>
            )}
          </div>
        </aside>
      )}

      {settingsOpen&&(
        <aside className={`${styles.drawer} ${styles.settings}`}>
          <div className={styles.drawerHead}>
            <div>
              <small>HER9AL</small>
              <h2>Settings</h2>
            </div>
            <button onClick={()=>setSettingsOpen(false)}>×</button>
          </div>

          <label>
            Master output
            <input
              type="range"
              min="0" max="1" step=".01"
              value={master}
              onChange={e=>setMaster(Number(e.target.value))}
            />
          </label>

          <label>
            Beat FX depth
            <input
              type="range"
              min="0" max="1" step=".01"
              value={fxDepth}
              onChange={e=>setFxDepth(Number(e.target.value))}
            />
          </label>

          <p>
            Jog wheels scratch/seek. Knobs drag vertically.
            Double-click CUE to store the cue point.
          </p>
        </aside>
      )}
    </main>
  );
}
