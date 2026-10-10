'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A' | 'B';
type PadMode = 'hotcue' | 'padfx' | 'beatjump' | 'sampler';

type DeckState = {
  url: string;
  file?: File | null;
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
  peaks: number[];
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

const freshDeck = (): DeckState => ({
  url: '',
  file: null,
  title: 'NO TRACK LOADED',
  artist: 'HER9AL',
  bpm: 126,
  playing: false,
  time: 0,
  duration: 0,
  cue: 0,
  rate: 1,
  channel: .9,
  loopIn: null,
  loopOut: null,
  padMode: 'hotcue',
  hotCues: Array(8).fill(null),
  peaks: [],
});

const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

function fmt(v:number){
  if(!Number.isFinite(v)) return '00:00';
  const m=Math.floor(v/60),s=Math.floor(v%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function Waveform({
  peaks, progress, compact=false,
}:{
  peaks:number[];
  progress:number;
  compact?:boolean;
}){
  const canvas=useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const c=canvas.current;
    if(!c)return;
    const dpr=window.devicePixelRatio||1;
    const rect=c.getBoundingClientRect();
    c.width=Math.max(1,Math.floor(rect.width*dpr));
    c.height=Math.max(1,Math.floor(rect.height*dpr));
    const ctx=c.getContext('2d');
    if(!ctx)return;
    ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,rect.width,rect.height);

    const source=peaks.length?peaks:Array.from({length:160},(_,i)=>
      .12+.48*Math.abs(Math.sin(i*.31))*Math.abs(Math.cos(i*.087))
    );

    const count=source.length;
    const barW=rect.width/count;
    const mid=rect.height/2;

    for(let i=0;i<count;i++){
      const h=Math.max(1,source[i]*(compact?rect.height*.78:rect.height*.84));
      const x=i*barW;
      const active=(i/count)<=progress;
      ctx.fillStyle=active?'#51a8ff':'#265983';
      ctx.fillRect(x,mid-h/2,Math.max(1,barW*.68),h);
    }
  },[peaks,progress,compact]);

  return <canvas ref={canvas} className={styles.waveCanvas}/>;
}

export default function DJStudio(){
  const aRef=useRef<HTMLAudioElement>(null);
  const bRef=useRef<HTMLAudioElement>(null);
  const fileA=useRef<HTMLInputElement>(null);
  const fileB=useRef<HTMLInputElement>(null);

  const contextRef=useRef<AudioContext|null>(null);
  const masterGainRef=useRef<GainNode|null>(null);
  const nodesA=useRef<Nodes|null>(null);
  const nodesB=useRef<Nodes|null>(null);

  const [A,setA]=useState<DeckState>(freshDeck());
  const [B,setB]=useState<DeckState>(freshDeck());

  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(.92);
  const [fxOn,setFxOn]=useState(false);
  const [fxDepth,setFxDepth]=useState(.28);
  const [library,setLibrary]=useState(false);
  const [settings,setSettings]=useState(false);
  const [active,setActive]=useState<Record<string,boolean>>({});
  const [jogA,setJogA]=useState(0);
  const [jogB,setJogB]=useState(0);
  const [shiftA,setShiftA]=useState(false);
  const [shiftB,setShiftB]=useState(false);

  const [angles,setAngles]=useState<Record<string,number>>({
    trimA:0, trimB:0,
    hiA:0, hiB:0,
    midA:0, midB:0,
    lowA:0, lowB:0,
    filterA:0, filterB:0,
    master:0, fx:0,
    mic:0, mix:0, level:0,
  });

  const el=(d:DeckId)=>d==='A'?aRef.current:bRef.current;
  const deck=(d:DeckId)=>d==='A'?A:B;
  const patch=(d:DeckId,p:Partial<DeckState>)=>{
    if(d==='A')setA(v=>({...v,...p}));
    else setB(v=>({...v,...p}));
  };
  const nodes=(d:DeckId)=>d==='A'?nodesA.current:nodesB.current;

  const flash=(id:string,ms=160)=>{
    setActive(v=>({...v,[id]:true}));
    window.setTimeout(()=>setActive(v=>({...v,[id]:false})),ms);
  };

  const ensureGraph=async()=>{
    if(!aRef.current||!bRef.current)return;

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
        low.type='lowshelf'; low.frequency.value=240;

        const mid=ctx.createBiquadFilter();
        mid.type='peaking'; mid.frequency.value=1200; mid.Q.value=.75;

        const high=ctx.createBiquadFilter();
        high.type='highshelf'; high.frequency.value=4800;

        const filter=ctx.createBiquadFilter();
        filter.type='lowpass'; filter.frequency.value=20000; filter.Q.value=.7;

        const dry=ctx.createGain();
        const delay=ctx.createDelay(2);
        const feedback=ctx.createGain();
        const wet=ctx.createGain();
        const channel=ctx.createGain();
        const cross=ctx.createGain();

        dry.gain.value=1;
        wet.gain.value=0;
        delay.delayTime.value=.28;
        feedback.gain.value=.27;
        channel.gain.value=.9;

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
        cross.connect(masterGain);

        return {source,trim,low,mid,high,filter,dry,delay,feedback,wet,channel,cross};
      };

      nodesA.current=make(aRef.current);
      nodesB.current=make(bRef.current);
    }

    if(contextRef.current.state==='suspended'){
      await contextRef.current.resume();
    }
  };

  useEffect(()=>{
    if(masterGainRef.current)masterGainRef.current.gain.value=master;
  },[master]);

  useEffect(()=>{
    const left=cross<=0?1:1-cross;
    const right=cross>=0?1:1+cross;
    if(nodesA.current)nodesA.current.cross.gain.value=left;
    if(nodesB.current)nodesB.current.cross.gain.value=right;
  },[cross]);

  useEffect(()=>{
    if(nodesA.current)nodesA.current.channel.gain.value=A.channel;
  },[A.channel]);

  useEffect(()=>{
    if(nodesB.current)nodesB.current.channel.gain.value=B.channel;
  },[B.channel]);

  useEffect(()=>{
    if(aRef.current)aRef.current.playbackRate=A.rate;
  },[A.rate]);

  useEffect(()=>{
    if(bRef.current)bRef.current.playbackRate=B.rate;
  },[B.rate]);

  useEffect(()=>{
    for(const n of [nodesA.current,nodesB.current]){
      if(!n)continue;
      n.wet.gain.value=fxOn?fxDepth:0;
      n.dry.gain.value=fxOn?1-fxDepth*.4:1;
    }
  },[fxOn,fxDepth]);

  const buildPeaks=async(file:File)=>{
    try{
      const ctx=contextRef.current||new AudioContext();
      const data=await file.arrayBuffer();
      const buffer=await ctx.decodeAudioData(data.slice(0));
      const channel=buffer.getChannelData(0);
      const bins=280;
      const size=Math.max(1,Math.floor(channel.length/bins));
      const peaks:number[]=[];
      for(let i=0;i<bins;i++){
        const start=i*size;
        const end=Math.min(channel.length,start+size);
        let max=0;
        for(let j=start;j<end;j+=Math.max(1,Math.floor(size/64))){
          max=Math.max(max,Math.abs(channel[j]));
        }
        peaks.push(Math.max(.02,max));
      }
      return peaks;
    }catch{
      return [];
    }
  };

  const loadFile=async(d:DeckId,file:File)=>{
    await ensureGraph();
    const peaks=await buildPeaks(file);
    const url=URL.createObjectURL(file);
    patch(d,{
      url,file,title:file.name,artist:'Local file',playing:false,time:0,duration:0,
      cue:0,rate:1,loopIn:null,loopOut:null,hotCues:Array(8).fill(null),peaks
    });
    setLibrary(false);
    setTimeout(()=>el(d)?.load(),0);
  };

  const playPause=async(d:DeckId)=>{
    await ensureGraph();
    const a=el(d);
    if(!a||!deck(d).url)return;
    flash(`play${d}`,220);
    if(a.paused){await a.play();patch(d,{playing:true})}
    else{a.pause();patch(d,{playing:false})}
  };

  const cue=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    a.pause();
    a.currentTime=deck(d).cue;
    patch(d,{playing:false});
    flash(`cue${d}`,220);
  };

  const saveCue=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    patch(d,{cue:a.currentTime});
    flash(`cue${d}`,400);
  };

  const sync=(d:DeckId)=>{
    const other=d==='A'?B:A;
    const target=other.bpm||126;
    patch(d,{bpm:target,rate:clamp(target/126,.84,1.16)});
    flash(`sync${d}`,260);
  };

  const loopIn=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    patch(d,{loopIn:a.currentTime});
    flash(`in${d}`,180);
  };

  const loopOut=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    const start=deck(d).loopIn??Math.max(0,a.currentTime-.5);
    patch(d,{loopIn:start,loopOut:Math.max(start+.05,a.currentTime)});
    flash(`out${d}`,180);
  };

  const loop4=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    const len=4*60/(deck(d).bpm||126);
    patch(d,{loopIn:a.currentTime,loopOut:a.currentTime+len});
    flash(`loop${d}`,260);
  };

  const resizeLoop=(d:DeckId,factor:number)=>{
    const s=deck(d);
    if(s.loopIn===null||s.loopOut===null)return;
    patch(d,{loopOut:s.loopIn+Math.max(.05,(s.loopOut-s.loopIn)*factor)});
  };

  const clearLoop=(d:DeckId)=>patch(d,{loopIn:null,loopOut:null});

  const timeUpdate=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    const s=deck(d);

    if(s.loopIn!==null&&s.loopOut!==null&&a.currentTime>=s.loopOut){
      a.currentTime=s.loopIn;
    }

    patch(d,{time:a.currentTime,duration:a.duration||0});
  };

  const jogDrag=(d:DeckId)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    let px=e.clientX;

    const move=(ev:PointerEvent)=>{
      const dx=ev.clientX-px;
      px=ev.clientX;
      const a=el(d);
      if(a&&Number.isFinite(a.duration)){
        a.currentTime=clamp(a.currentTime+dx*.024,0,a.duration);
      }
      d==='A'?setJogA(v=>v+dx*.85):setJogB(v=>v+dx*.85);
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
    const d:DeckId|null=id.endsWith('A')?'A':id.endsWith('B')?'B':null;
    const n=d?nodes(d):null;

    if(id.startsWith('trim')&&n)n.trim.gain.value=.2+norm*1.8;
    if(id.startsWith('low')&&n)n.low.gain.value=bipolar*12;
    if(id.startsWith('mid')&&n)n.mid.gain.value=bipolar*12;
    if(id.startsWith('hi')&&n)n.high.gain.value=bipolar*12;

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
    const sy=e.clientY;
    const start=angles[id]||0;

    const move=(ev:PointerEvent)=>{
      const angle=clamp(start+(sy-ev.clientY)*1.05,-135,135);
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

  const sampler=(d:DeckId,index:number)=>{
    const s=deck(d);
    if(!s.url)return;
    const sample=new Audio(s.url);
    sample.volume=.65;
    sample.playbackRate=s.rate;
    const start=s.hotCues[index]??s.cue??0;
    sample.currentTime=Math.max(0,start);
    sample.play().catch(()=>{});
    setTimeout(()=>sample.pause(),350);
  };

  const usePad=(d:DeckId,index:number)=>{
    const s=deck(d);
    const a=el(d);
    if(!a)return;

    if(s.padMode==='hotcue'){
      const cues=[...s.hotCues];
      if(cues[index]===null)cues[index]=a.currentTime;
      else a.currentTime=cues[index] as number;
      patch(d,{hotCues:cues});
    }

    if(s.padMode==='beatjump'){
      const beats=[-8,-4,-2,-1,1,2,4,8];
      const jump=beats[index]*60/(s.bpm||126);
      a.currentTime=clamp(a.currentTime+jump,0,a.duration||a.currentTime+jump);
    }

    if(s.padMode==='padfx'){
      setFxOn(true);
      setTimeout(()=>setFxOn(false),220);
    }

    if(s.padMode==='sampler')sampler(d,index);

    flash(`pad${d}${index}`,180);
  };

  const tapBpm=(d:DeckId)=>{
    const now=performance.now();
    const key=`tap-${d}`;
    const bag=(window as any)[key] as number[]|undefined;
    const next=[...(bag||[]),now].slice(-5);
    (window as any)[key]=next;
    if(next.length>=2){
      const diffs=next.slice(1).map((v,i)=>v-next[i]);
      const avg=diffs.reduce((a,b)=>a+b,0)/diffs.length;
      patch(d,{bpm:Math.round(60000/avg)});
    }
    flash(`tap${d}`,150);
  };

  const Hit=({id,x,y,w,h,onClick,round=false}:{
    id:string,x:number,y:number,w:number,h:number,onClick:()=>void,round?:boolean
  })=>(
    <button
      className={`${styles.hit} ${round?styles.round:''} ${active[id]?styles.lit:''}`}
      style={{left:`${x}%`,top:`${y}%`,width:`${w}%`,height:`${h}%`}}
      onClick={onClick}
      aria-label={id}
    />
  );

  const Knob=({id,src,x,y,s}:{
    id:string,src:string,x:number,y:number,s:number
  })=>(
    <div
      className={styles.knob}
      style={{left:`${x}%`,top:`${y}%`,width:`${s}%`}}
      onPointerDown={knobDrag(id)}
      aria-label={id}
    >
      <img src={src} alt="" draggable={false} style={{transform:`rotate(${angles[id]||0}deg)`}}/>
    </div>
  );

  const progressA=A.duration?A.time/A.duration:0;
  const progressB=B.duration?B.time/B.duration:0;

  return <main className={styles.page}>
    <audio ref={aRef} src={A.url} onTimeUpdate={()=>timeUpdate('A')} onEnded={()=>patch('A',{playing:false})}/>
    <audio ref={bRef} src={B.url} onTimeUpdate={()=>timeUpdate('B')} onEnded={()=>patch('B',{playing:false})}/>

    <input ref={fileA} hidden type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&loadFile('A',e.target.files[0])}/>
    <input ref={fileB} hidden type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&loadFile('B',e.target.files[0])}/>

    <header className={styles.wavebar}>
      <div className={styles.track}>
        <strong>{A.title}</strong>
        <span>{A.artist}</span>
        <div className={styles.meta}><b>{A.bpm}</b><small>BPM</small><em>{fmt(A.time)}</em></div>
        <div className={styles.mini}><Waveform peaks={A.peaks} progress={progressA} compact/></div>
      </div>

      <div className={styles.centerWave}>
        <div className={styles.waveHalf}><Waveform peaks={A.peaks} progress={progressA}/></div>
        <div className={styles.waveHalf}><Waveform peaks={B.peaks} progress={progressB}/></div>
        <div className={styles.centerPlayhead}/>
        {[18,38,62,82].map(v=><i key={v} style={{left:`${v}%`}}/>)}
      </div>

      <div className={`${styles.track} ${styles.trackRight}`}>
        <strong>{B.title}</strong>
        <span>{B.artist}</span>
        <div className={styles.meta}><b>{B.bpm}</b><small>BPM</small><em>{fmt(B.time)}</em></div>
        <div className={styles.mini}><Waveform peaks={B.peaks} progress={progressB} compact/></div>
      </div>
    </header>

    <div className={styles.studioBar}>
      <button onClick={()=>history.back()}>← Learning Dojo</button>
      <b>STUDIO</b>
      <span>HER9AL</span>
    </div>

    <section className={styles.stage}>
      <div className={styles.controller}>
        <img src="/dj/flx4-photo.png" className={styles.base} alt="DDJ-FLX4"/>

        <div className={`${styles.jog} ${styles.jogA} ${A.playing?styles.spinning:''}`} onPointerDown={jogDrag('A')}>
          <img src="/dj/jog-a.png" alt="" draggable={false} style={{transform:`rotate(${jogA}deg)`}}/>
        </div>
        <div className={`${styles.jog} ${styles.jogB} ${B.playing?styles.spinning:''}`} onPointerDown={jogDrag('B')}>
          <img src="/dj/jog-b.png" alt="" draggable={false} style={{transform:`rotate(${jogB}deg)`}}/>
        </div>

        <Knob id="trimA" src="/dj/trim-a.png" x={42.5} y={18.5} s={4.8}/>
        <Knob id="trimB" src="/dj/trim-b.png" x={50.5} y={18.5} s={4.8}/>
        <Knob id="hiA" src="/dj/hi-a.png" x={42.5} y={26.6} s={4.8}/>
        <Knob id="hiB" src="/dj/hi-b.png" x={50.5} y={26.6} s={4.8}/>
        <Knob id="midA" src="/dj/mid-a.png" x={42.5} y={34.8} s={4.8}/>
        <Knob id="midB" src="/dj/mid-b.png" x={50.5} y={34.8} s={4.8}/>
        <Knob id="lowA" src="/dj/low-a.png" x={42.5} y={43.1} s={4.8}/>
        <Knob id="lowB" src="/dj/low-b.png" x={50.5} y={43.1} s={4.8}/>
        <Knob id="filterA" src="/dj/filter-a.png" x={42.5} y={51.8} s={4.8}/>
        <Knob id="filterB" src="/dj/filter-b.png" x={50.5} y={51.8} s={4.8}/>
        <Knob id="master" src="/dj/master.png" x={56.0} y={18.9} s={5.0}/>
        <Knob id="fx" src="/dj/fx-depth.png" x={56.0} y={72.9} s={5.0}/>

        {/* LOAD */}
        <Hit id="loadA" x={39.0} y={4.5} w={4.0} h={4.2} onClick={()=>fileA.current?.click()}/>
        <Hit id="loadB" x={51.8} y={4.5} w={4.0} h={4.2} onClick={()=>fileB.current?.click()}/>

        {/* Transport */}
        <Hit id="cueA" x={3.4} y={76.2} w={5.5} h={7.5} onClick={()=>cue('A')} round/>
        <Hit id="playA" x={3.4} y={84.7} w={5.5} h={7.5} onClick={()=>playPause('A')} round/>
        <Hit id="cueB" x={67.0} y={76.2} w={5.5} h={7.5} onClick={()=>cue('B')} round/>
        <Hit id="playB" x={67.0} y={84.7} w={5.5} h={7.5} onClick={()=>playPause('B')} round/>

        {/* Shift */}
        <Hit id="shiftA" x={4.5} y={67.0} w={4.0} h={4.0} onClick={()=>setShiftA(v=>!v)}/>
        <Hit id="shiftB" x={68.2} y={67.0} w={4.0} h={4.0} onClick={()=>setShiftB(v=>!v)}/>

        {/* Loop / Sync */}
        <Hit id="inA" x={6.0} y={11.5} w={4.3} h={4.0} onClick={()=>loopIn('A')} round/>
        <Hit id="outA" x={11.0} y={11.5} w={4.3} h={4.0} onClick={()=>loopOut('A')} round/>
        <Hit id="loopA" x={15.9} y={11.0} w={6.5} h={4.5} onClick={()=>loop4('A')}/>
        <Hit id="syncA" x={25.4} y={10.6} w={4.2} h={4.6} onClick={()=>sync('A')} round/>

        <Hit id="inB" x={69.5} y={11.5} w={4.3} h={4.0} onClick={()=>loopIn('B')} round/>
        <Hit id="outB" x={74.5} y={11.5} w={4.3} h={4.0} onClick={()=>loopOut('B')} round/>
        <Hit id="loopB" x={79.4} y={11.0} w={6.5} h={4.5} onClick={()=>loop4('B')}/>
        <Hit id="syncB" x={88.9} y={10.6} w={4.2} h={4.6} onClick={()=>sync('B')} round/>

        <Hit id="halfA" x={20.0} y={14.0} w={2.7} h={2.6} onClick={()=>resizeLoop('A',.5)}/>
        <Hit id="doubleA" x={23.0} y={14.0} w={2.7} h={2.6} onClick={()=>resizeLoop('A',2)}/>
        <Hit id="exitA" x={16.4} y={14.0} w={3.0} h={2.6} onClick={()=>clearLoop('A')}/>
        <Hit id="halfB" x={83.5} y={14.0} w={2.7} h={2.6} onClick={()=>resizeLoop('B',.5)}/>
        <Hit id="doubleB" x={86.5} y={14.0} w={2.7} h={2.6} onClick={()=>resizeLoop('B',2)}/>
        <Hit id="exitB" x={79.9} y={14.0} w={3.0} h={2.6} onClick={()=>clearLoop('B')}/>

        {/* Pad mode row */}
        {(['hotcue','padfx','beatjump','sampler'] as PadMode[]).map((mode,i)=>
          <Hit key={'ma'+mode} id={'ma'+mode} x={9.0+i*5.2} y={73.7} w={4.6} h={3.0} onClick={()=>patch('A',{padMode:mode})}/>
        )}
        {(['hotcue','padfx','beatjump','sampler'] as PadMode[]).map((mode,i)=>
          <Hit key={'mb'+mode} id={'mb'+mode} x={72.6+i*5.2} y={73.7} w={4.6} h={3.0} onClick={()=>patch('B',{padMode:mode})}/>
        )}

        {/* 8 performance pads each */}
        {Array.from({length:8}).map((_,i)=>
          <Hit key={'pa'+i} id={'padA'+i}
            x={9.0+(i%4)*5.25} y={78.0+Math.floor(i/4)*7.2}
            w={4.7} h={6.0} onClick={()=>usePad('A',i)}/>
        )}
        {Array.from({length:8}).map((_,i)=>
          <Hit key={'pb'+i} id={'padB'+i}
            x={72.6+(i%4)*5.25} y={78.0+Math.floor(i/4)*7.2}
            w={4.7} h={6.0} onClick={()=>usePad('B',i)}/>
        )}

        {/* FX */}
        <Hit id="fxOn" x={53.7} y={82.0} w={4.6} h={5.0} onClick={()=>setFxOn(v=>!v)} round/>
        <Hit id="beatMinus" x={53.2} y={61.3} w={2.7} h={3.1} onClick={()=>setFxDepth(v=>clamp(v-.08,0,1))}/>
        <Hit id="beatPlus" x={56.0} y={61.3} w={2.7} h={3.1} onClick={()=>setFxDepth(v=>clamp(v+.08,0,1))}/>
        <Hit id="tapA" x={55.2} y={64.8} w={3.7} h={3.0} onClick={()=>tapBpm('A')}/>
        <Hit id="tapB" x={55.2} y={68.0} w={3.7} h={3.0} onClick={()=>tapBpm('B')}/>

        {/* Invisible fader hit areas — no fake browser knobs */}
        <input className={`${styles.vRange} ${styles.tempoA}`} type="range" min=".84" max="1.16" step=".001" value={A.rate} onChange={e=>patch('A',{rate:Number(e.target.value)})}/>
        <input className={`${styles.vRange} ${styles.tempoB}`} type="range" min=".84" max="1.16" step=".001" value={B.rate} onChange={e=>patch('B',{rate:Number(e.target.value)})}/>
        <input className={`${styles.vRange} ${styles.channelA}`} type="range" min="0" max="1" step=".01" value={A.channel} onChange={e=>patch('A',{channel:Number(e.target.value)})}/>
        <input className={`${styles.vRange} ${styles.channelB}`} type="range" min="0" max="1" step=".01" value={B.channel} onChange={e=>patch('B',{channel:Number(e.target.value)})}/>
        <input className={styles.crossRange} type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/>

        <button className={styles.cueStoreA} onDoubleClick={()=>saveCue('A')} aria-label="save cue A"/>
        <button className={styles.cueStoreB} onDoubleClick={()=>saveCue('B')} aria-label="save cue B"/>
      </div>
    </section>

    <button className={styles.flag}>⚑</button>

    <nav className={styles.dock}>
      <button onClick={()=>setLibrary(v=>!v)}>♫ Music Library</button>
      <button>♬ DDJ-FLX4</button>
      <button onClick={()=>setSettings(v=>!v)}>⚙ Settings</button>
    </nav>

    <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

    {library&&<aside className={styles.drawer}>
      <div className={styles.drawerHead}>
        <div><small>HER9AL</small><h2>Music Library</h2></div>
        <button onClick={()=>setLibrary(false)}>×</button>
      </div>
      <div className={styles.loadGrid}>
        <button onClick={()=>fileA.current?.click()}><strong>LOAD DECK A</strong><span>MP3 / WAV / M4A</span></button>
        <button onClick={()=>fileB.current?.click()}><strong>LOAD DECK B</strong><span>MP3 / WAV / M4A</span></button>
      </div>
    </aside>}

    {settings&&<aside className={`${styles.drawer} ${styles.settings}`}>
      <div className={styles.drawerHead}>
        <div><small>HER9AL</small><h2>Settings</h2></div>
        <button onClick={()=>setSettings(false)}>×</button>
      </div>
      <label>Master output<input type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/></label>
      <label>Beat FX depth<input type="range" min="0" max="1" step=".01" value={fxDepth} onChange={e=>setFxDepth(Number(e.target.value))}/></label>
      <p>Real audio: dual decks, cue, loops, sync, EQ, filter, delay FX, hot cues, beat jump, sampler, tempo, channel faders, crossfader and jog seek.</p>
    </aside>}
  </main>
}
