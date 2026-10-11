'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

const freshDeck = ():Deck => ({
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
  hotCues:Array(8).fill(null),
  padMode:'hotcue',
  peaks:[],
  tempoRange:.16,
  cueMonitor:false,
});

function fmt(seconds:number){
  if(!Number.isFinite(seconds)) return '00:00';
  const m=Math.floor(seconds/60);
  const s=Math.floor(seconds%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function Wave({peaks,progress}:{peaks:number[],progress:number}){
  const ref=useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const canvas=ref.current;
    if(!canvas)return;

    const rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.round(rect.width*dpr));
    canvas.height=Math.max(1,Math.round(rect.height*dpr));

    const ctx=canvas.getContext('2d');
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,rect.width,rect.height);

    const source=peaks.length
      ? peaks
      : Array.from({length:260},(_,i)=>.12+.5*Math.abs(Math.sin(i*.29)*Math.cos(i*.072)));

    const bw=rect.width/source.length;
    const mid=rect.height/2;

    source.forEach((p,i)=>{
      const h=Math.max(1,p*rect.height*.88);
      ctx.fillStyle=(i/source.length)<=progress ? '#4aa5ff' : '#275a82';
      ctx.fillRect(i*bw,mid-h/2,Math.max(1,bw*.68),h);
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

  const ctxRef=useRef<AudioContext|null>(null);
  const masterGainRef=useRef<GainNode|null>(null);
  const nodesA=useRef<Nodes|null>(null);
  const nodesB=useRef<Nodes|null>(null);
  const jogOffsetA=useRef(0);
  const jogOffsetB=useRef(0);
  const raf=useRef<number|null>(null);

  const tapA=useRef<number[]>([]);
  const tapB=useRef<number[]>([]);

  const [A,setA]=useState<Deck>(freshDeck());
  const [B,setB]=useState<Deck>(freshDeck());
  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(.92);
  const [fxOn,setFxOn]=useState(false);
  const [fxDepth,setFxDepth]=useState(.25);
  const [fxBeat,setFxBeat]=useState(1);
  const [fxType,setFxType]=useState<'delay'|'echo'|'filter'>('delay');
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [loading,setLoading]=useState(true);
  const [loadingPct,setLoadingPct]=useState(0);
  const [tracks,setTracks]=useState<Track[]>([]);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState<Record<string,boolean>>({});
  const [angles,setAngles]=useState<Record<string,number>>({
    trimA:0,trimB:0,hiA:0,hiB:0,midA:0,midB:0,
    lowA:0,lowB:0,filterA:0,filterB:0,master:0,fx:0,
  });

  const audio=(d:DeckId)=>d==='A'?audioA.current:audioB.current;
  const deck=(d:DeckId)=>d==='A'?A:B;
  const node=(d:DeckId)=>d==='A'?nodesA.current:nodesB.current;
  const patch=(d:DeckId,p:Partial<Deck>)=>d==='A'?setA(v=>({...v,...p})):setB(v=>({...v,...p}));

  useEffect(()=>{
    let cancelled=false;
    const run=async()=>{
      for(const pct of [12,28,47,66,82,94,100]){
        if(cancelled)return;
        setLoadingPct(pct);
        await new Promise(r=>setTimeout(r,pct===100?260:110));
      }
      if(!cancelled)setLoading(false);
    };
    run();
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    fetch('/api/auth/session',{cache:'no-store'})
      .then(r=>{ if(r.status===401) location.href='/login'; })
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

    if(!ctxRef.current){
      const ctx=new AudioContext();
      ctxRef.current=ctx;

      const masterNode=ctx.createGain();
      masterNode.gain.value=master;
      masterNode.connect(ctx.destination);
      masterGainRef.current=masterNode;

      const make=(media:HTMLMediaElement):Nodes=>{
        const source=ctx.createMediaElementSource(media);
        const trim=ctx.createGain();

        const low=ctx.createBiquadFilter();
        low.type='lowshelf';
        low.frequency.value=240;

        const mid=ctx.createBiquadFilter();
        mid.type='peaking';
        mid.frequency.value=1200;
        mid.Q.value=.8;

        const high=ctx.createBiquadFilter();
        high.type='highshelf';
        high.frequency.value=4800;

        const filter=ctx.createBiquadFilter();
        filter.type='lowpass';
        filter.frequency.value=20000;

        const dry=ctx.createGain();
        const delay=ctx.createDelay(4);
        const feedback=ctx.createGain();
        const wet=ctx.createGain();
        const channel=ctx.createGain();
        const crossNode=ctx.createGain();

        dry.gain.value=1;
        wet.gain.value=0;
        delay.delayTime.value=.24;
        feedback.gain.value=.28;
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
        crossNode.connect(masterNode);

        return{
          source,trim,low,mid,high,filter,dry,delay,feedback,wet,channel,cross:crossNode
        };
      };

      nodesA.current=make(audioA.current);
      nodesB.current=make(audioB.current);
    }

    if(ctxRef.current.state==='suspended'){
      await ctxRef.current.resume();
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
    const bpm=(A.bpm+B.bpm)/2||126;
    const beatSeconds=60/bpm;
    const delayTime=beatSeconds*fxBeat;

    for(const n of [nodesA.current,nodesB.current]){
      if(!n)continue;
      n.delay.delayTime.value=clamp(delayTime,.03,3.5);

      if(fxType==='filter'){
        n.wet.gain.value=0;
        n.dry.gain.value=1;
        n.filter.type='lowpass';
        n.filter.frequency.value=fxOn?1200+fxDepth*8000:20000;
      }else{
        n.wet.gain.value=fxOn?fxDepth:0;
        n.dry.gain.value=fxOn?1-fxDepth*.35:1;
        n.feedback.gain.value=fxType==='echo'?.45:.28;
      }
    }
  },[fxOn,fxDepth,fxBeat,fxType,A.bpm,B.bpm]);

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
      const ctx=ctxRef.current||new AudioContext();
      const data=await file.arrayBuffer();
      const buffer=await ctx.decodeAudioData(data.slice(0));
      const channel=buffer.getChannelData(0);
      const bins=320;
      const block=Math.max(1,Math.floor(channel.length/bins));
      const out:number[]=[];

      for(let i=0;i<bins;i++){
        let max=0;
        const start=i*block;
        const end=Math.min(channel.length,start+block);
        const step=Math.max(1,Math.floor(block/64));

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

  const storeCue=(d:DeckId)=>{
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

  const toggle4Beat=(d:DeckId)=>{
    const s=deck(d);
    if(s.loopIn!==null&&s.loopOut!==null){
      patch(d,{loopIn:null,loopOut:null});
      return;
    }

    const a=audio(d);
    if(!a)return;

    const length=4*60/(s.bpm||126);
    patch(d,{
      loopIn:a.currentTime,
      loopOut:a.currentTime+length
    });

    flash(`loop${d}`,260);
  };

  const resizeLoop=(d:DeckId,factor:number)=>{
    const s=deck(d);
    if(s.loopIn===null||s.loopOut===null)return;

    patch(d,{
      loopOut:s.loopIn+Math.max(.05,(s.loopOut-s.loopIn)*factor)
    });
  };

  const callCue=(d:DeckId,dir:-1|1)=>{
    const s=deck(d);
    const a=audio(d);
    if(!a)return;

    const cues=s.hotCues.filter((x):x is number=>x!==null).sort((x,y)=>x-y);
    if(!cues.length)return;

    if(dir<0){
      const prev=[...cues].reverse().find(c=>c<a.currentTime-.01);
      a.currentTime=prev??cues[cues.length-1];
    }else{
      const next=cues.find(c=>c>a.currentTime+.01);
      a.currentTime=next??cues[0];
    }
  };

  const memoryCue=(d:DeckId)=>{
    const a=audio(d);
    if(!a)return;

    const s=deck(d);
    const cues=[...s.hotCues];
    const free=cues.findIndex(c=>c===null);
    cues[free===-1?0:free]=a.currentTime;
    patch(d,{hotCues:cues});
    flash(`memory${d}`,220);
  };

  const sync=(d:DeckId)=>{
    const other=d==='A'?B:A;
    const target=other.bpm||126;

    patch(d,{
      bpm:target,
      rate:clamp(target/126,1-deck(d).tempoRange,1+deck(d).tempoRange)
    });

    flash(`sync${d}`,260);
  };

  const cycleTempoRange=(d:DeckId)=>{
    const ranges=[.06,.10,.16,.50];
    const current=deck(d).tempoRange;
    const index=ranges.findIndex(r=>Math.abs(r-current)<.001);
    patch(d,{tempoRange:ranges[(index+1)%ranges.length]});
    flash(`range${d}`,180);
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
        a.currentTime=clamp(a.currentTime+dx*.024,0,a.duration);
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

    const n=d?node(d):null;

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
        n.filter.frequency.value=20000*Math.pow(.025,-bipolar);
      }else{
        n.filter.type='highpass';
        n.filter.frequency.value=30*Math.pow(300,bipolar);
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

  const tapBpm=(d:DeckId)=>{
    const bag=d==='A'?tapA:tapB;
    const now=performance.now();
    bag.current=[...bag.current,now].slice(-5);

    if(bag.current.length>=2){
      const intervals=bag.current.slice(1).map((v,i)=>v-bag.current[i]);
      const avg=intervals.reduce((a,b)=>a+b,0)/intervals.length;
      const bpm=clamp(Math.round(60000/avg),50,220);
      patch(d,{bpm});
    }

    flash(`tap${d}`,150);
  };

  const cycleFx=()=>{
    setFxType(v=>v==='delay'?'echo':v==='echo'?'filter':'delay');
    flash('fxselect',180);
  };

  const setPadMode=(d:DeckId,mode:PadMode)=>{
    patch(d,{padMode:mode});
    flash(`mode${d}${mode}`,180);
  };

  const playSampler=(d:DeckId,index:number)=>{
    const s=deck(d);
    if(!s.track?.url)return;

    const sample=new Audio(s.track.url);
    sample.volume=.6;
    sample.playbackRate=s.rate;
    sample.currentTime=s.hotCues[index]??s.cue??0;
    sample.play().catch(()=>{});
    window.setTimeout(()=>sample.pause(),360);
  };

  const keyboardPad=(index:number)=>{
    const ctx=ctxRef.current;
    if(!ctx)return;

    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    const freq=220*Math.pow(2,index/12);

    osc.frequency.value=freq;
    gain.gain.value=.06;

    osc.connect(gain);
    gain.connect(masterGainRef.current!);

    osc.start();
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.2);
    osc.stop(ctx.currentTime+.22);
  };

  const usePad=(d:DeckId,index:number)=>{
    const s=deck(d);
    const a=audio(d);
    if(!a)return;

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

    if(s.padMode==='sampler'){
      playSampler(d,index);
    }

    if(s.padMode==='padfx1'){
      setFxOn(true);
      setFxDepth(.25+.07*(index%4));
      window.setTimeout(()=>setFxOn(false),220);
    }

    if(s.padMode==='keyboard'){
      keyboardPad(index);
    }

    if(s.padMode==='padfx2'){
      setFxOn(true);
      setFxDepth(.55+.05*(index%4));
      window.setTimeout(()=>setFxOn(false),260);
    }

    if(s.padMode==='beatloop'){
      const beats=[.25,.5,1,2,4,8,16,32];
      const length=beats[index]*60/(s.bpm||126);
      patch(d,{
        loopIn:a.currentTime,
        loopOut:a.currentTime+length
      });
    }

    if(s.padMode==='keyshift'){
      const semitones=[-4,-3,-2,-1,1,2,3,4][index];
      const next=clamp(Math.pow(2,semitones/12),.75,1.33);
      patch(d,{rate:next});
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
        style={{transform:`rotate(${angles[id]||0}deg)`}}
      />
    </div>
  );

  const progressA=A.duration?A.time/A.duration:0;
  const progressB=B.duration?B.time/B.duration:0;

  const filtered=tracks.filter(t=>
    `${t.title} ${t.artist||''}`.toLowerCase().includes(query.toLowerCase())
  );

  const primaryModes:PadMode[]=['hotcue','padfx1','beatjump','sampler'];
  const secondaryModes:PadMode[]=['keyboard','padfx2','beatloop','keyshift'];

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
          <div className={styles.loaderCard}>
            <div className={styles.loaderWheel}><span>H</span></div>
            <small>HER9AL WEB DJ</small>
            <h1>Loading DDJ-FLX4</h1>
            <div className={styles.loaderBar}>
              <div style={{width:`${loadingPct}%`}}/>
            </div>
            <b>{loadingPct}%</b>
          </div>
        </div>
      )}

      <header className={styles.header}>
        <div className={styles.deckInfo}>
          <strong>{A.title}</strong>
          <span>{A.artist}</span>
          <div className={styles.stats}>
            <b>A</b>
            <em>{A.bpm} BPM</em>
            <i>{fmt(A.time)} / {fmt(A.duration)}</i>
          </div>
          <div className={styles.miniWave}>
            <Wave peaks={A.peaks} progress={progressA}/>
          </div>
        </div>

        <div className={styles.centerWave}>
          <div className={styles.waveRow}><Wave peaks={A.peaks} progress={progressA}/></div>
          <div className={styles.waveRow}><Wave peaks={B.peaks} progress={progressB}/></div>
          <div className={styles.playhead}/>
          {[18,38,62,82].map(v=><i key={v} style={{left:`${v}%`}}/>)}
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
            <Wave peaks={B.peaks} progress={progressB}/>
          </div>
        </div>
      </header>

      <div className={styles.studioBar}>
        <button onClick={()=>history.back()}>← HER9AL</button>
        <strong>STUDIO</strong>
        <span>{fxType.toUpperCase()} FX</span>
      </div>

      <section className={styles.stage}>
        <div className={styles.controller}>
          <img src="/dj/flx4-4k.png" className={styles.base} alt="DDJ-FLX4"/>

          <div className={`${styles.jog} ${styles.jogA}`} onPointerDown={jogDrag('A')}>
            <img ref={jogARef} src="/dj/jog-a.png" alt="" draggable={false}/>
          </div>
          <div className={`${styles.jog} ${styles.jogB}`} onPointerDown={jogDrag('B')}>
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

          {/* LOAD / BACK / VIEW */}
          <Hit id="loadA" x={39.2} y={4.4} w={4.1} h={4.0} onClick={()=>setLibraryOpen(true)}/>
          <Hit id="loadB" x={51.9} y={4.4} w={4.1} h={4.0} onClick={()=>setLibraryOpen(true)}/>
          <Hit id="back" x={46.2} y={3.0} w={4.0} h={4.0} onClick={()=>setLibraryOpen(false)}/>
          <Hit id="view" x={55.0} y={5.0} w={4.0} h={3.2} onClick={()=>setLibraryOpen(v=>!v)}/>

          {/* TOP LEFT DECK A */}
          <Hit id="inA" x={5.4} y={10.5} w={4.5} h={4.6} onClick={()=>loopIn('A')} round/>
          <Hit id="outA" x={10.4} y={10.5} w={4.5} h={4.6} onClick={()=>loopOut('A')} round/>
          <Hit id="loopA" x={15.4} y={10.2} w={7.6} h={4.7} onClick={()=>toggle4Beat('A')}/>
          <Hit id="syncA" x={26.4} y={10.2} w={4.8} h={4.8} onClick={()=>sync('A')} round/>
          <Hit id="callPrevA" x={19.0} y={13.3} w={2.8} h={2.8} onClick={()=>callCue('A',-1)}/>
          <Hit id="callNextA" x={24.2} y={13.3} w={2.8} h={2.8} onClick={()=>callCue('A',1)}/>
          <Hit id="halfA" x={21.6} y={13.3} w={2.2} h={2.8} onClick={()=>resizeLoop('A',.5)}/>
          <Hit id="doubleA" x={27.1} y={13.3} w={2.2} h={2.8} onClick={()=>resizeLoop('A',2)}/>
          <Hit id="memoryA" x={24.1} y={15.8} w={3.8} h={2.5} onClick={()=>memoryCue('A')}/>
          <Hit id="rangeA" x={27.0} y={16.3} w={4.3} h={2.8} onClick={()=>cycleTempoRange('A')}/>

          {/* TOP RIGHT DECK B */}
          <Hit id="inB" x={69.0} y={10.5} w={4.5} h={4.6} onClick={()=>loopIn('B')} round/>
          <Hit id="outB" x={74.0} y={10.5} w={4.5} h={4.6} onClick={()=>loopOut('B')} round/>
          <Hit id="loopB" x={79.0} y={10.2} w={7.6} h={4.7} onClick={()=>toggle4Beat('B')}/>
          <Hit id="syncB" x={90.0} y={10.2} w={4.8} h={4.8} onClick={()=>sync('B')} round/>
          <Hit id="callPrevB" x={82.6} y={13.3} w={2.8} h={2.8} onClick={()=>callCue('B',-1)}/>
          <Hit id="callNextB" x={87.8} y={13.3} w={2.8} h={2.8} onClick={()=>callCue('B',1)}/>
          <Hit id="halfB" x={85.2} y={13.3} w={2.2} h={2.8} onClick={()=>resizeLoop('B',.5)}/>
          <Hit id="doubleB" x={90.7} y={13.3} w={2.2} h={2.8} onClick={()=>resizeLoop('B',2)}/>
          <Hit id="memoryB" x={87.7} y={15.8} w={3.8} h={2.5} onClick={()=>memoryCue('B')}/>
          <Hit id="rangeB" x={90.6} y={16.3} w={4.3} h={2.8} onClick={()=>cycleTempoRange('B')}/>

          {/* TRANSPORT */}
          <Hit id="cueA" x={3.1} y={76.0} w={5.7} h={7.8} onClick={()=>cue('A')} round/>
          <Hit id="playA" x={3.1} y={84.5} w={5.7} h={7.8} onClick={()=>playPause('A')} round/>
          <Hit id="cueB" x={66.7} y={76.0} w={5.7} h={7.8} onClick={()=>cue('B')} round/>
          <Hit id="playB" x={66.7} y={84.5} w={5.7} h={7.8} onClick={()=>playPause('B')} round/>

          {/* SHIFT */}
          <Hit id="shiftA" x={4.2} y={67.0} w={3.8} h={3.8}
            onClick={()=>setPadMode('A',A.padMode==='hotcue'?'keyboard':'hotcue')}/>
          <Hit id="shiftB" x={67.8} y={67.0} w={3.8} h={3.8}
            onClick={()=>setPadMode('B',B.padMode==='hotcue'?'keyboard':'hotcue')}/>

          {/* CHANNEL CUE */}
          <Hit id="chCueA" x={42.3} y={62.1} w={4.2} h={3.4}
            onClick={()=>patch('A',{cueMonitor:!A.cueMonitor})}/>
          <Hit id="chCueB" x={50.5} y={62.1} w={4.2} h={3.4}
            onClick={()=>patch('B',{cueMonitor:!B.cueMonitor})}/>

          {/* PAD MODE ROW 1 */}
          {primaryModes.map((mode,i)=>
            <Hit key={`pmA-${mode}`} id={`pmA${mode}`}
              x={8.7+i*5.25} y={73.4} w={4.7} h={3.0}
              onClick={()=>setPadMode('A',mode)}/>
          )}
          {primaryModes.map((mode,i)=>
            <Hit key={`pmB-${mode}`} id={`pmB${mode}`}
              x={72.3+i*5.25} y={73.4} w={4.7} h={3.0}
              onClick={()=>setPadMode('B',mode)}/>
          )}

          {/* PAD MODE ROW 2 */}
          {secondaryModes.map((mode,i)=>
            <Hit key={`smA-${mode}`} id={`smA${mode}`}
              x={8.7+i*5.25} y={76.1} w={4.7} h={2.6}
              onClick={()=>setPadMode('A',mode)}/>
          )}
          {secondaryModes.map((mode,i)=>
            <Hit key={`smB-${mode}`} id={`smB${mode}`}
              x={72.3+i*5.25} y={76.1} w={4.7} h={2.6}
              onClick={()=>setPadMode('B',mode)}/>
          )}

          {/* 8 PADS PER DECK */}
          {Array.from({length:8}).map((_,i)=>
            <Hit key={`padA-${i}`} id={`padA${i}`}
              x={8.7+(i%4)*5.25}
              y={79.3+Math.floor(i/4)*7.15}
              w={4.7} h={6.0}
              onClick={()=>usePad('A',i)}/>
          )}
          {Array.from({length:8}).map((_,i)=>
            <Hit key={`padB-${i}`} id={`padB${i}`}
              x={72.3+(i%4)*5.25}
              y={79.3+Math.floor(i/4)*7.15}
              w={4.7} h={6.0}
              onClick={()=>usePad('B',i)}/>
          )}

          {/* BEAT FX AREA */}
          <Hit id="smartCfx" x={35.1} y={52.7} w={3.8} h={4.5}
            onClick={()=>setFxOn(v=>!v)} round/>
          <Hit id="fxselect" x={54.0} y={52.7} w={5.0} h={3.8}
            onClick={cycleFx}/>
          <Hit id="beatMinus" x={53.8} y={61.3} w={2.4} h={3.0}
            onClick={()=>setFxBeat(v=>clamp(v/2,.25,4))}/>
          <Hit id="beatPlus" x={56.3} y={61.3} w={2.4} h={3.0}
            onClick={()=>setFxBeat(v=>clamp(v*2,.25,4))}/>
          <Hit id="auto" x={53.5} y={64.7} w={2.8} h={2.8}
            onClick={()=>setFxBeat(1)}/>
          <Hit id="tapA" x={56.5} y={64.7} w={2.8} h={2.8}
            onClick={()=>tapBpm('A')}/>
          <Hit id="tapB" x={56.5} y={67.6} w={2.8} h={2.8}
            onClick={()=>tapBpm('B')}/>
          <Hit id="fxOn" x={54.0} y={82.0} w={4.5} h={5.2}
            onClick={()=>setFxOn(v=>!v)} round/>

          {/* FADERS */}
          <input
            className={`${styles.vRange} ${styles.tempoA}`}
            type="range"
            min={1-A.tempoRange}
            max={1+A.tempoRange}
            step=".001"
            value={A.rate}
            onChange={e=>patch('A',{rate:Number(e.target.value)})}
          />
          <img className={styles.tempoCapA} src="/dj/tempo-cap-a.png" alt=""
            style={{top:`${65.8+(1-((A.rate-(1-A.tempoRange))/(2*A.tempoRange)))*12}%`}}/>

          <input
            className={`${styles.vRange} ${styles.tempoB}`}
            type="range"
            min={1-B.tempoRange}
            max={1+B.tempoRange}
            step=".001"
            value={B.rate}
            onChange={e=>patch('B',{rate:Number(e.target.value)})}
          />
          <img className={styles.tempoCapB} src="/dj/tempo-cap-b.png" alt=""
            style={{top:`${65.8+(1-((B.rate-(1-B.tempoRange))/(2*B.tempoRange)))*12}%`}}/>

          <input
            className={`${styles.vRange} ${styles.channelA}`}
            type="range"
            min="0" max="1" step=".01"
            value={A.channel}
            onChange={e=>patch('A',{channel:Number(e.target.value)})}
          />
          <img className={styles.chCapA} src="/dj/ch-cap-a.png" alt=""
            style={{top:`${64.2+(1-A.channel)*13}%`}}/>

          <input
            className={`${styles.vRange} ${styles.channelB}`}
            type="range"
            min="0" max="1" step=".01"
            value={B.channel}
            onChange={e=>patch('B',{channel:Number(e.target.value)})}
          />
          <img className={styles.chCapB} src="/dj/ch-cap-b.png" alt=""
            style={{top:`${64.2+(1-B.channel)*13}%`}}/>

          <input
            className={styles.crossRange}
            type="range"
            min="-1" max="1" step=".01"
            value={cross}
            onChange={e=>setCross(Number(e.target.value))}
          />
          <img className={styles.crossCap} src="/dj/cross-cap.png" alt=""
            style={{left:`${45.0+((cross+1)/2)*8.0}%`}}/>

          <button className={styles.storeCueA} onDoubleClick={()=>storeCue('A')} aria-label="Store cue A"/>
          <button className={styles.storeCueB} onDoubleClick={()=>storeCue('B')} aria-label="Store cue B"/>
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
            <button onClick={()=>fileA.current?.click()}>Load local → Deck A</button>
            <button onClick={()=>fileB.current?.click()}>Load local → Deck B</button>
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
            {!filtered.length&&<p>No published DJ tracks yet. Load a local file.</p>}
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
            <input type="range" min="0" max="1" step=".01"
              value={master} onChange={e=>setMaster(Number(e.target.value))}/>
          </label>

          <label>
            Beat FX depth
            <input type="range" min="0" max="1" step=".01"
              value={fxDepth} onChange={e=>setFxDepth(Number(e.target.value))}/>
          </label>

          <div className={styles.statusGrid}>
            <span>Deck A mode</span><b>{A.padMode}</b>
            <span>Deck B mode</span><b>{B.padMode}</b>
            <span>FX</span><b>{fxType} · {fxBeat} beat</b>
            <span>CUE 1</span><b>{A.cueMonitor?'ON':'OFF'}</b>
            <span>CUE 2</span><b>{B.cueMonitor?'ON':'OFF'}</b>
          </div>
        </aside>
      )}
    </main>
  );
}
