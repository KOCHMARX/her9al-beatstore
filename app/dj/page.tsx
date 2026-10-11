'use client';

import { useEffect, useRef, useState } from 'react';
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
  channel: number;
  loopIn: number | null;
  loopOut: number | null;
  peaks: number[];
  hotCues: Array<number | null>;
};

const freshDeck = (): Deck => ({
  url: '',
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
  peaks: [],
  hotCues: Array(8).fill(null),
});

const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

function formatTime(seconds:number){
  if(!Number.isFinite(seconds))return '00:00';
  const m=Math.floor(seconds/60);
  const s=Math.floor(seconds%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function Waveform({
  peaks, progress
}:{
  peaks:number[];
  progress:number;
}){
  const ref=useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const canvas=ref.current;
    if(!canvas)return;

    const rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.floor(rect.width*dpr));
    canvas.height=Math.max(1,Math.floor(rect.height*dpr));

    const ctx=canvas.getContext('2d');
    if(!ctx)return;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,rect.width,rect.height);

    const data=peaks.length
      ? peaks
      : Array.from({length:200},(_,i)=>.12+.5*Math.abs(Math.sin(i*.27)*Math.cos(i*.071)));

    const bar=rect.width/data.length;
    const center=rect.height/2;

    data.forEach((peak,i)=>{
      const height=Math.max(1,peak*rect.height*.84);
      ctx.fillStyle=(i/data.length)<=progress ? '#55aaff' : '#24577f';
      ctx.fillRect(
        i*bar,
        center-height/2,
        Math.max(1,bar*.7),
        height
      );
    });
  },[peaks,progress]);

  return <canvas ref={ref} className={styles.waveCanvas}/>;
}

export default function DJStudio(){
  const audioA=useRef<HTMLAudioElement>(null);
  const audioB=useRef<HTMLAudioElement>(null);
  const fileA=useRef<HTMLInputElement>(null);
  const fileB=useRef<HTMLInputElement>(null);

  const jogAEl=useRef<HTMLImageElement>(null);
  const jogBEl=useRef<HTMLImageElement>(null);
  const jogOffsetA=useRef(0);
  const jogOffsetB=useRef(0);
  const animationFrame=useRef<number|null>(null);

  const contextRef=useRef<AudioContext|null>(null);
  const masterGainRef=useRef<GainNode|null>(null);
  const nodesA=useRef<any>(null);
  const nodesB=useRef<any>(null);

  const [scale,setScale]=useState(1);
  const [A,setA]=useState<Deck>(freshDeck());
  const [B,setB]=useState<Deck>(freshDeck());
  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(.92);
  const [fxOn,setFxOn]=useState(false);
  const [fxDepth,setFxDepth]=useState(.28);
  const [library,setLibrary]=useState(false);
  const [settings,setSettings]=useState(false);
  const [lit,setLit]=useState<Record<string,boolean>>({});

  const [angles,setAngles]=useState<Record<string,number>>({
    trimA:0,trimB:0,hiA:0,hiB:0,midA:0,midB:0,
    lowA:0,lowB:0,filterA:0,filterB:0,master:0,fx:0,
  });

  const element=(d:DeckId)=>d==='A'?audioA.current:audioB.current;
  const deck=(d:DeckId)=>d==='A'?A:B;
  const node=(d:DeckId)=>d==='A'?nodesA.current:nodesB.current;

  const patch=(d:DeckId,next:Partial<Deck>)=>{
    if(d==='A')setA(v=>({...v,...next}));
    else setB(v=>({...v,...next}));
  };

  useEffect(()=>{
    const resize=()=>{
      const sx=window.innerWidth/1351;
      const sy=window.innerHeight/630;
      setScale(Math.min(sx,sy)*.995);
    };
    resize();
    window.addEventListener('resize',resize);
    return()=>window.removeEventListener('resize',resize);
  },[]);

  useEffect(()=>{
    fetch('/api/auth/session',{cache:'no-store'})
      .then(r=>{ if(r.status===401) window.location.href='/login'; })
      .catch(()=>{});
  },[]);

  const flash=(id:string,ms=150)=>{
    setLit(v=>({...v,[id]:true}));
    window.setTimeout(()=>setLit(v=>({...v,[id]:false})),ms);
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

      const make=(media:HTMLMediaElement)=>{
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
        const delay=ctx.createDelay(2);
        const feedback=ctx.createGain();
        const wet=ctx.createGain();

        const channel=ctx.createGain();
        const crossNode=ctx.createGain();

        dry.gain.value=1;
        wet.gain.value=0;
        delay.delayTime.value=.28;
        feedback.gain.value=.26;
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

        return{
          source,trim,low,mid,high,filter,
          dry,delay,feedback,wet,channel,cross:crossNode
        };
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
      n.dry.gain.value=fxOn?1-fxDepth*.38:1;
    }
  },[fxOn,fxDepth]);

  // Smooth automatic jog/vinyl rotation linked directly to audio currentTime.
  useEffect(()=>{
    const tick=()=>{
      if(jogAEl.current){
        const time=audioA.current?.currentTime||0;
        const angle=time*180+jogOffsetA.current;
        jogAEl.current.style.transform=`rotate(${angle}deg)`;
      }
      if(jogBEl.current){
        const time=audioB.current?.currentTime||0;
        const angle=time*180+jogOffsetB.current;
        jogBEl.current.style.transform=`rotate(${angle}deg)`;
      }
      animationFrame.current=requestAnimationFrame(tick);
    };

    animationFrame.current=requestAnimationFrame(tick);

    return()=>{
      if(animationFrame.current!==null){
        cancelAnimationFrame(animationFrame.current);
      }
    };
  },[]);

  const makePeaks=async(file:File)=>{
    try{
      const ctx=contextRef.current||new AudioContext();
      const data=await file.arrayBuffer();
      const buffer=await ctx.decodeAudioData(data.slice(0));
      const samples=buffer.getChannelData(0);
      const bins=300;
      const block=Math.max(1,Math.floor(samples.length/bins));
      const output:number[]=[];

      for(let i=0;i<bins;i++){
        const start=i*block;
        const end=Math.min(samples.length,start+block);
        let max=0;

        for(let j=start;j<end;j+=Math.max(1,Math.floor(block/64))){
          max=Math.max(max,Math.abs(samples[j]));
        }

        output.push(Math.max(.025,max));
      }

      return output;
    }catch{
      return [];
    }
  };

  const loadFile=async(d:DeckId,file:File)=>{
    await ensureGraph();
    const peaks=await makePeaks(file);
    const url=URL.createObjectURL(file);

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
      peaks,
      hotCues:Array(8).fill(null),
    });

    if(d==='A')jogOffsetA.current=0;
    else jogOffsetB.current=0;

    setLibrary(false);
    window.setTimeout(()=>element(d)?.load(),0);
  };

  const playPause=async(d:DeckId)=>{
    await ensureGraph();
    const audio=element(d);

    if(!audio||!deck(d).url)return;

    flash(`play${d}`,220);

    if(audio.paused){
      await audio.play();
      patch(d,{playing:true});
    }else{
      audio.pause();
      patch(d,{playing:false});
    }
  };

  const cue=(d:DeckId)=>{
    const audio=element(d);
    if(!audio)return;

    audio.pause();
    audio.currentTime=deck(d).cue;
    patch(d,{playing:false});
    flash(`cue${d}`,220);
  };

  const saveCue=(d:DeckId)=>{
    const audio=element(d);
    if(!audio)return;
    patch(d,{cue:audio.currentTime});
    flash(`cue${d}`,380);
  };

  const sync=(d:DeckId)=>{
    const other=d==='A'?B:A;
    const bpm=other.bpm||126;
    patch(d,{
      bpm,
      rate:clamp(bpm/126,.84,1.16)
    });
    flash(`sync${d}`,260);
  };

  const loopIn=(d:DeckId)=>{
    const audio=element(d);
    if(!audio)return;
    patch(d,{loopIn:audio.currentTime});
    flash(`in${d}`,180);
  };

  const loopOut=(d:DeckId)=>{
    const audio=element(d);
    if(!audio)return;

    const start=deck(d).loopIn??Math.max(0,audio.currentTime-.5);

    patch(d,{
      loopIn:start,
      loopOut:Math.max(start+.05,audio.currentTime)
    });

    flash(`out${d}`,180);
  };

  const loop4=(d:DeckId)=>{
    const audio=element(d);
    if(!audio)return;

    const len=4*60/(deck(d).bpm||126);

    patch(d,{
      loopIn:audio.currentTime,
      loopOut:audio.currentTime+len
    });

    flash(`loop${d}`,250);
  };

  const clearLoop=(d:DeckId)=>patch(d,{loopIn:null,loopOut:null});

  const resizeLoop=(d:DeckId,factor:number)=>{
    const s=deck(d);
    if(s.loopIn===null||s.loopOut===null)return;

    patch(d,{
      loopOut:s.loopIn+Math.max(.05,(s.loopOut-s.loopIn)*factor)
    });
  };

  const timeUpdate=(d:DeckId)=>{
    const audio=element(d);
    if(!audio)return;

    const s=deck(d);

    if(
      s.loopIn!==null &&
      s.loopOut!==null &&
      audio.currentTime>=s.loopOut
    ){
      audio.currentTime=s.loopIn;
    }

    patch(d,{
      time:audio.currentTime,
      duration:audio.duration||0
    });
  };

  const dragJog=(d:DeckId)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    let previous=e.clientX;

    const move=(event:PointerEvent)=>{
      const dx=event.clientX-previous;
      previous=event.clientX;

      const audio=element(d);

      if(audio&&Number.isFinite(audio.duration)){
        audio.currentTime=clamp(
          audio.currentTime+dx*.024,
          0,
          audio.duration
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
        n.filter.frequency.value=
          20000*Math.pow(.025,-bipolar);
      }else{
        n.filter.type='highpass';
        n.filter.frequency.value=
          30*Math.pow(300,bipolar);
      }
    }

    if(id==='master'){
      setMaster(norm);
    }

    if(id==='fx'){
      setFxDepth(norm);
    }
  };

  const dragKnob=(id:string)=>async(e:React.PointerEvent<HTMLDivElement>)=>{
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
    const audio=element(d);
    const s=deck(d);

    if(!audio)return;

    const cues=[...s.hotCues];

    if(cues[index]===null){
      cues[index]=audio.currentTime;
    }else{
      audio.currentTime=cues[index] as number;
    }

    patch(d,{hotCues:cues});
    flash(`pad${d}${index}`,190);
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
      className={`${styles.hit} ${round?styles.round:''} ${lit[id]?styles.lit:''}`}
      style={{left:x,top:y,width:w,height:h}}
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
      style={{left:x,top:y,width:size,height:size}}
      onPointerDown={dragKnob(id)}
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

  const pA=A.duration?A.time/A.duration:0;
  const pB=B.duration?B.time/B.duration:0;

  return (
    <main className={styles.viewport}>
      <audio
        ref={audioA}
        src={A.url}
        onTimeUpdate={()=>timeUpdate('A')}
        onEnded={()=>patch('A',{playing:false})}
      />
      <audio
        ref={audioB}
        src={B.url}
        onTimeUpdate={()=>timeUpdate('B')}
        onEnded={()=>patch('B',{playing:false})}
      />

      <input
        ref={fileA}
        hidden
        type="file"
        accept="audio/*"
        onChange={e=>e.target.files?.[0]&&loadFile('A',e.target.files[0])}
      />
      <input
        ref={fileB}
        hidden
        type="file"
        accept="audio/*"
        onChange={e=>e.target.files?.[0]&&loadFile('B',e.target.files[0])}
      />

      <div
        className={styles.canvas}
        style={{transform:`translate(-50%,-50%) scale(${scale})`}}
      >
        {/* Exact visual reference supplied by the user */}
        <img
          src="/dj/reference-page.png"
          className={styles.reference}
          alt=""
        />

        {/* Dynamic deck information replaces the demo track text */}
        <div className={styles.coverLeft}/>
        <div className={styles.coverRight}/>
        <div className={styles.leftMeta}>
          <strong>{A.title}</strong>
          <span>{A.artist}</span>
          <div><b>{A.bpm}</b><em>{formatTime(A.time)}</em></div>
        </div>
        <div className={styles.rightMeta}>
          <strong>{B.title}</strong>
          <span>{B.artist}</span>
          <div><b>{B.bpm}</b><em>{formatTime(B.time)}</em></div>
        </div>
        <div className={styles.leftWave}>
          <Waveform peaks={A.peaks} progress={pA}/>
        </div>
        <div className={styles.rightWave}>
          <Waveform peaks={B.peaks} progress={pB}/>
        </div>
        <div className={styles.centerWaveTop}>
          <Waveform peaks={A.peaks} progress={pA}/>
        </div>
        <div className={styles.centerWaveBottom}>
          <Waveform peaks={B.peaks} progress={pB}/>
        </div>
        <div className={styles.wavePlayhead}/>

        {/* Replace third-party page branding */}
        <div className={styles.coverTopRight}/>
        <button className={styles.back} onClick={()=>history.back()}>
          ← HER9AL
        </button>
        <div className={styles.coverBrand}/>
        <div className={styles.brand}>
          HER9AL <small>Web DJ</small>
        </div>

        {/* Controller interaction layer locked to the exact screenshot controller coordinates */}
        <div className={styles.controller}>
          {/* Jogs: exact screenshot pixels, auto-rotate from audio currentTime and scratch with mouse */}
          <div
            className={`${styles.jog} ${styles.jogA}`}
            onPointerDown={dragJog('A')}
          >
            <img ref={jogAEl} src="/dj/jog-a.png" alt="" draggable={false}/>
          </div>
          <div
            className={`${styles.jog} ${styles.jogB}`}
            onPointerDown={dragJog('B')}
          >
            <img ref={jogBEl} src="/dj/jog-b.png" alt="" draggable={false}/>
          </div>

          {/* Rotating mixer knobs from exact screenshot pixels */}
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

          {/* LOAD */}
          <Hit id="loadA" x={349} y={8} w={42} h={27} onClick={()=>fileA.current?.click()}/>
          <Hit id="loadB" x={421} y={8} w={42} h={27} onClick={()=>fileB.current?.click()}/>

          {/* Transport */}
          <Hit id="cueA" x={16} y={350} w={49} h={49} onClick={()=>cue('A')} round/>
          <Hit id="playA" x={16} y={402} w={49} h={49} onClick={()=>playPause('A')} round/>
          <Hit id="cueB" x={577} y={350} w={49} h={49} onClick={()=>cue('B')} round/>
          <Hit id="playB" x={577} y={402} w={49} h={49} onClick={()=>playPause('B')} round/>

          {/* Loop / Sync */}
          <Hit id="inA" x={28} y={26} w={44} h={27} onClick={()=>loopIn('A')} round/>
          <Hit id="outA" x={77} y={26} w={44} h={27} onClick={()=>loopOut('A')} round/>
          <Hit id="loopA" x={128} y={26} w={62} h={28} onClick={()=>loop4('A')}/>
          <Hit id="syncA" x={222} y={25} w={42} h={29} onClick={()=>sync('A')} round/>

          <Hit id="inB" x={590} y={26} w={44} h={27} onClick={()=>loopIn('B')} round/>
          <Hit id="outB" x={639} y={26} w={44} h={27} onClick={()=>loopOut('B')} round/>
          <Hit id="loopB" x={690} y={26} w={62} h={28} onClick={()=>loop4('B')}/>
          <Hit id="syncB" x={784} y={25} w={42} h={29} onClick={()=>sync('B')} round/>

          {/* Loop half / double / exit */}
          <Hit id="exitA" x={128} y={47} w={32} h={20} onClick={()=>clearLoop('A')}/>
          <Hit id="halfA" x={166} y={47} w={24} h={20} onClick={()=>resizeLoop('A',.5)}/>
          <Hit id="doubleA" x={203} y={47} w={24} h={20} onClick={()=>resizeLoop('A',2)}/>
          <Hit id="exitB" x={690} y={47} w={32} h={20} onClick={()=>clearLoop('B')}/>
          <Hit id="halfB" x={728} y={47} w={24} h={20} onClick={()=>resizeLoop('B',.5)}/>
          <Hit id="doubleB" x={765} y={47} w={24} h={20} onClick={()=>resizeLoop('B',2)}/>

          {/* Pads */}
          {Array.from({length:8}).map((_,i)=>(
            <Hit
              key={`padA-${i}`}
              id={`padA${i}`}
              x={73+(i%4)*43}
              y={373+Math.floor(i/4)*39}
              w={38}
              h={35}
              onClick={()=>usePad('A',i)}
            />
          ))}
          {Array.from({length:8}).map((_,i)=>(
            <Hit
              key={`padB-${i}`}
              id={`padB${i}`}
              x={635+(i%4)*43}
              y={373+Math.floor(i/4)*39}
              w={38}
              h={35}
              onClick={()=>usePad('B',i)}
            />
          ))}

          {/* Real invisible inputs + moving screenshot fader-cap sprites */}
          <input
            className={`${styles.vRange} ${styles.tempoAInput}`}
            type="range"
            min=".84"
            max="1.16"
            step=".001"
            value={A.rate}
            onChange={e=>patch('A',{rate:Number(e.target.value)})}
          />
          <img
            className={styles.tempoCapA}
            src="/dj/tempo-cap-a.png"
            alt=""
            style={{top:315+(1-(A.rate-.84)/.32)*72}}
          />

          <input
            className={`${styles.vRange} ${styles.tempoBInput}`}
            type="range"
            min=".84"
            max="1.16"
            step=".001"
            value={B.rate}
            onChange={e=>patch('B',{rate:Number(e.target.value)})}
          />
          <img
            className={styles.tempoCapB}
            src="/dj/tempo-cap-b.png"
            alt=""
            style={{top:315+(1-(B.rate-.84)/.32)*72}}
          />

          <input
            className={`${styles.vRange} ${styles.channelAInput}`}
            type="range"
            min="0"
            max="1"
            step=".01"
            value={A.channel}
            onChange={e=>patch('A',{channel:Number(e.target.value)})}
          />
          <img
            className={styles.channelCapA}
            src="/dj/channel-cap-a.png"
            alt=""
            style={{top:303+(1-A.channel)*70}}
          />

          <input
            className={`${styles.vRange} ${styles.channelBInput}`}
            type="range"
            min="0"
            max="1"
            step=".01"
            value={B.channel}
            onChange={e=>patch('B',{channel:Number(e.target.value)})}
          />
          <img
            className={styles.channelCapB}
            src="/dj/channel-cap-b.png"
            alt=""
            style={{top:303+(1-B.channel)*70}}
          />

          <input
            className={styles.crossInput}
            type="range"
            min="-1"
            max="1"
            step=".01"
            value={cross}
            onChange={e=>setCross(Number(e.target.value))}
          />
          <img
            className={styles.crossCap}
            src="/dj/cross-cap.png"
            alt=""
            style={{left:390+((cross+1)/2)*74}}
          />

          {/* Beat FX */}
          <Hit id="fxOn" x={511} y={376} w={39} h={39} onClick={()=>setFxOn(v=>!v)} round/>

          <button className={styles.storeCueA} onDoubleClick={()=>saveCue('A')} aria-label="store cue A"/>
          <button className={styles.storeCueB} onDoubleClick={()=>saveCue('B')} aria-label="store cue B"/>
        </div>

        {/* Bottom dock buttons are click areas on top of the exact screenshot dock */}
        <button className={styles.libraryHit} onClick={()=>setLibrary(v=>!v)} aria-label="Music Library"/>
        <button className={styles.settingsHit} onClick={()=>setSettings(v=>!v)} aria-label="Settings"/>

        {library&&(
          <aside className={styles.drawer}>
            <div className={styles.drawerHead}>
              <div>
                <small>HER9AL</small>
                <h2>Music Library</h2>
              </div>
              <button onClick={()=>setLibrary(false)}>×</button>
            </div>
            <div className={styles.loadGrid}>
              <button onClick={()=>fileA.current?.click()}>
                <b>LOAD DECK A</b>
                <span>MP3 / WAV / M4A</span>
              </button>
              <button onClick={()=>fileB.current?.click()}>
                <b>LOAD DECK B</b>
                <span>MP3 / WAV / M4A</span>
              </button>
            </div>
          </aside>
        )}

        {settings&&(
          <aside className={`${styles.drawer} ${styles.settingsDrawer}`}>
            <div className={styles.drawerHead}>
              <div>
                <small>HER9AL</small>
                <h2>Settings</h2>
              </div>
              <button onClick={()=>setSettings(false)}>×</button>
            </div>
            <label>
              Master output
              <input
                type="range"
                min="0"
                max="1"
                step=".01"
                value={master}
                onChange={e=>setMaster(Number(e.target.value))}
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
                onChange={e=>setFxDepth(Number(e.target.value))}
              />
            </label>
          </aside>
        )}
      </div>
    </main>
  );
}
