'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId='A'|'B';
type PadMode='hotcue'|'padfx1'|'beatjump'|'sampler'|'keyboard'|'padfx2'|'beatloop'|'keyshift';

type Track={id?:string;title:string;artist?:string;url:string;bpm?:number};

type Deck={
  track:Track|null; title:string; artist:string; bpm:number; playing:boolean;
  time:number; duration:number; cue:number; rate:number; channel:number;
  loopIn:number|null; loopOut:number|null; hotCues:Array<number|null>;
  padMode:PadMode; peaks:number[]; tempoRange:number;
};

type Nodes={
  source:MediaElementAudioSourceNode; trim:GainNode;
  low:BiquadFilterNode; mid:BiquadFilterNode; high:BiquadFilterNode;
  filter:BiquadFilterNode; dry:GainNode; delay:DelayNode;
  feedback:GainNode; wet:GainNode; channel:GainNode; cross:GainNode;
};

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const fresh=():Deck=>({
  track:null,title:'NO TRACK LOADED',artist:'HER9AL',bpm:126,playing:false,
  time:0,duration:0,cue:0,rate:1,channel:.88,loopIn:null,loopOut:null,
  hotCues:Array(8).fill(null),padMode:'hotcue',peaks:[],tempoRange:.16
});

function fmt(v:number){
  if(!Number.isFinite(v))return'00:00';
  const m=Math.floor(v/60),s=Math.floor(v%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function Wave({peaks,progress}:{peaks:number[],progress:number}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const c=ref.current;if(!c)return;
    const r=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
    c.width=Math.max(1,Math.round(r.width*dpr));c.height=Math.max(1,Math.round(r.height*dpr));
    const x=c.getContext('2d');if(!x)return;
    x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,r.width,r.height);
    const p=peaks.length?peaks:Array.from({length:230},(_,i)=>.1+.48*Math.abs(Math.sin(i*.29)*Math.cos(i*.071)));
    const bw=r.width/p.length,mid=r.height/2;
    p.forEach((v,i)=>{
      const h=Math.max(1,v*r.height*.86);
      x.fillStyle=i/p.length<=progress?'#4da5ff':'#24577f';
      x.fillRect(i*bw,mid-h/2,Math.max(1,bw*.67),h);
    });
  },[peaks,progress]);
  return <canvas ref={ref} className={styles.wave}/>;
}

export default function DJStudio(){
  const aRef=useRef<HTMLAudioElement>(null),bRef=useRef<HTMLAudioElement>(null);
  const fileA=useRef<HTMLInputElement>(null),fileB=useRef<HTMLInputElement>(null);
  const jogA=useRef<HTMLImageElement>(null),jogB=useRef<HTMLImageElement>(null);
  const jogOffA=useRef(0),jogOffB=useRef(0),raf=useRef<number|null>(null);
  const ctxRef=useRef<AudioContext|null>(null),masterRef=useRef<GainNode|null>(null);
  const nodesA=useRef<Nodes|null>(null),nodesB=useRef<Nodes|null>(null);
  const tapA=useRef<number[]>([]),tapB=useRef<number[]>([]);

  const [A,setA]=useState<Deck>(fresh()),[B,setB]=useState<Deck>(fresh());
  const [cross,setCross]=useState(0),[master,setMaster]=useState(.92);
  const [fxOn,setFxOn]=useState(false),[fxDepth,setFxDepth]=useState(.25);
  const [fxBeat,setFxBeat]=useState(1),[fxType,setFxType]=useState<'delay'|'echo'|'filter'>('delay');
  const [library,setLibrary]=useState(false),[settings,setSettings]=useState(false);
  const [tracks,setTracks]=useState<Track[]>([]),[query,setQuery]=useState('');
  const [loading,setLoading]=useState(true),[loadingPct,setLoadingPct]=useState(0);
  const [active,setActive]=useState<Record<string,boolean>>({});

  const audio=(d:DeckId)=>d==='A'?aRef.current:bRef.current;
  const deck=(d:DeckId)=>d==='A'?A:B;
  const node=(d:DeckId)=>d==='A'?nodesA.current:nodesB.current;
  const patch=(d:DeckId,p:Partial<Deck>)=>d==='A'?setA(v=>({...v,...p})):setB(v=>({...v,...p}));

  useEffect(()=>{
    let stop=false;
    (async()=>{
      for(const n of [10,24,43,62,79,92,100]){
        if(stop)return;setLoadingPct(n);await new Promise(r=>setTimeout(r,n===100?180:90));
      }
      if(!stop)setLoading(false);
    })();
    return()=>{stop=true};
  },[]);

  useEffect(()=>{
    fetch('/api/auth/session',{cache:'no-store'}).then(r=>{if(r.status===401)location.href='/login'}).catch(()=>{});
    fetch('/api/dj/tracks',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{
      setTracks((j?.tracks||[]).map((t:any)=>({
        id:t.id,title:t.title,artist:t.artist||'HER9AL',
        url:t.audio_url||t.url,bpm:Number(t.bpm)||126
      })).filter((t:any)=>t.url));
    }).catch(()=>{});
  },[]);

  const flash=(id:string,ms=160)=>{
    setActive(v=>({...v,[id]:true}));
    setTimeout(()=>setActive(v=>({...v,[id]:false})),ms);
  };

  const ensureGraph=async()=>{
    if(!aRef.current||!bRef.current)return;
    if(!ctxRef.current){
      const ctx=new AudioContext();ctxRef.current=ctx;
      const masterGain=ctx.createGain();masterGain.gain.value=master;masterGain.connect(ctx.destination);masterRef.current=masterGain;
      const make=(media:HTMLMediaElement):Nodes=>{
        const source=ctx.createMediaElementSource(media),trim=ctx.createGain();
        const low=ctx.createBiquadFilter();low.type='lowshelf';low.frequency.value=240;
        const mid=ctx.createBiquadFilter();mid.type='peaking';mid.frequency.value=1200;mid.Q.value=.8;
        const high=ctx.createBiquadFilter();high.type='highshelf';high.frequency.value=4800;
        const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=20000;
        const dry=ctx.createGain(),delay=ctx.createDelay(4),feedback=ctx.createGain(),wet=ctx.createGain(),channel=ctx.createGain(),crossNode=ctx.createGain();
        dry.gain.value=1;wet.gain.value=0;delay.delayTime.value=.24;feedback.gain.value=.28;channel.gain.value=.88;
        source.connect(trim);trim.connect(low);low.connect(mid);mid.connect(high);high.connect(filter);
        filter.connect(dry);dry.connect(channel);filter.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(channel);
        channel.connect(crossNode);crossNode.connect(masterGain);
        return{source,trim,low,mid,high,filter,dry,delay,feedback,wet,channel,cross:crossNode};
      };
      nodesA.current=make(aRef.current);nodesB.current=make(bRef.current);
    }
    if(ctxRef.current.state==='suspended')await ctxRef.current.resume();
  };

  useEffect(()=>{if(masterRef.current)masterRef.current.gain.value=master},[master]);
  useEffect(()=>{if(nodesA.current)nodesA.current.channel.gain.value=A.channel;if(nodesB.current)nodesB.current.channel.gain.value=B.channel},[A.channel,B.channel]);
  useEffect(()=>{
    const l=cross<=0?1:1-cross,r=cross>=0?1:1+cross;
    if(nodesA.current)nodesA.current.cross.gain.value=l;if(nodesB.current)nodesB.current.cross.gain.value=r;
  },[cross]);
  useEffect(()=>{if(aRef.current)aRef.current.playbackRate=A.rate},[A.rate]);
  useEffect(()=>{if(bRef.current)bRef.current.playbackRate=B.rate},[B.rate]);
  useEffect(()=>{
    const bpm=(A.bpm+B.bpm)/2||126,seconds=(60/bpm)*fxBeat;
    for(const n of [nodesA.current,nodesB.current]){
      if(!n)continue;
      n.delay.delayTime.value=clamp(seconds,.03,3.5);
      if(fxType==='filter'){
        n.wet.gain.value=0;n.dry.gain.value=1;n.filter.type='lowpass';n.filter.frequency.value=fxOn?1200+fxDepth*8000:20000;
      }else{
        n.wet.gain.value=fxOn?fxDepth:0;n.dry.gain.value=fxOn?1-fxDepth*.35:1;n.feedback.gain.value=fxType==='echo'?.45:.28;
      }
    }
  },[fxOn,fxDepth,fxBeat,fxType,A.bpm,B.bpm]);

  useEffect(()=>{
    const tick=()=>{
      if(jogA.current)jogA.current.style.transform=`rotate(${(aRef.current?.currentTime||0)*180+jogOffA.current}deg)`;
      if(jogB.current)jogB.current.style.transform=`rotate(${(bRef.current?.currentTime||0)*180+jogOffB.current}deg)`;
      raf.current=requestAnimationFrame(tick);
    };
    raf.current=requestAnimationFrame(tick);
    return()=>{if(raf.current!==null)cancelAnimationFrame(raf.current)};
  },[]);

  const makePeaks=async(file:File)=>{
    try{
      const ctx=ctxRef.current||new AudioContext(),data=await file.arrayBuffer(),buf=await ctx.decodeAudioData(data.slice(0));
      const c=buf.getChannelData(0),bins=320,size=Math.max(1,Math.floor(c.length/bins)),out:number[]=[];
      for(let i=0;i<bins;i++){
        let mx=0;const start=i*size,end=Math.min(c.length,start+size),step=Math.max(1,Math.floor(size/64));
        for(let j=start;j<end;j+=step)mx=Math.max(mx,Math.abs(c[j]));
        out.push(Math.max(.025,mx));
      }
      return out;
    }catch{return[]}
  };

  const loadLocal=async(d:DeckId,file:File)=>{
    await ensureGraph();const peaks=await makePeaks(file),url=URL.createObjectURL(file);
    patch(d,{track:{title:file.name,artist:'Local file',url,bpm:126},title:file.name,artist:'Local file',bpm:126,playing:false,time:0,duration:0,cue:0,rate:1,loopIn:null,loopOut:null,hotCues:Array(8).fill(null),peaks});
    d==='A'?jogOffA.current=0:jogOffB.current=0;setLibrary(false);setTimeout(()=>audio(d)?.load(),0);
  };
  const loadTrack=async(d:DeckId,t:Track)=>{
    await ensureGraph();patch(d,{track:t,title:t.title,artist:t.artist||'HER9AL',bpm:t.bpm||126,playing:false,time:0,duration:0,cue:0,rate:1,loopIn:null,loopOut:null,hotCues:Array(8).fill(null),peaks:[]});
    d==='A'?jogOffA.current=0:jogOffB.current=0;setLibrary(false);setTimeout(()=>audio(d)?.load(),0);
  };

  const playPause=async(d:DeckId)=>{
    await ensureGraph();const a=audio(d);if(!a||!deck(d).track)return;
    flash(`play${d}`,220);if(a.paused){await a.play();patch(d,{playing:true})}else{a.pause();patch(d,{playing:false})}
  };
  const cue=(d:DeckId)=>{const a=audio(d);if(!a)return;a.pause();a.currentTime=deck(d).cue;patch(d,{playing:false});flash(`cue${d}`,220)};
  const saveCue=(d:DeckId)=>{const a=audio(d);if(!a)return;patch(d,{cue:a.currentTime});flash(`cue${d}`,360)};
  const loopIn=(d:DeckId)=>{const a=audio(d);if(a)patch(d,{loopIn:a.currentTime})};
  const loopOut=(d:DeckId)=>{const a=audio(d);if(!a)return;const s=deck(d).loopIn??Math.max(0,a.currentTime-.5);patch(d,{loopIn:s,loopOut:Math.max(s+.05,a.currentTime)})};
  const loop4=(d:DeckId)=>{const a=audio(d),s=deck(d);if(!a)return;if(s.loopIn!==null&&s.loopOut!==null){patch(d,{loopIn:null,loopOut:null});return}const len=4*60/(s.bpm||126);patch(d,{loopIn:a.currentTime,loopOut:a.currentTime+len})};
  const resizeLoop=(d:DeckId,f:number)=>{const s=deck(d);if(s.loopIn===null||s.loopOut===null)return;patch(d,{loopOut:s.loopIn+Math.max(.05,(s.loopOut-s.loopIn)*f)})};
  const sync=(d:DeckId)=>{const bpm=(d==='A'?B:A).bpm||126;patch(d,{bpm,rate:clamp(bpm/126,1-deck(d).tempoRange,1+deck(d).tempoRange)})};
  const tempoRange=(d:DeckId)=>{const rs=[.06,.10,.16,.50],cur=deck(d).tempoRange,i=rs.findIndex(v=>Math.abs(v-cur)<.001);patch(d,{tempoRange:rs[(i+1)%rs.length]})};
  const timeUpdate=(d:DeckId)=>{const a=audio(d);if(!a)return;const s=deck(d);if(s.loopIn!==null&&s.loopOut!==null&&a.currentTime>=s.loopOut)a.currentTime=s.loopIn;patch(d,{time:a.currentTime,duration:a.duration||0})};

  const dragJog=(d:DeckId)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);let px=e.clientX;
    const move=(ev:PointerEvent)=>{const dx=ev.clientX-px;px=ev.clientX;const a=audio(d);if(a&&Number.isFinite(a.duration))a.currentTime=clamp(a.currentTime+dx*.022,0,a.duration);d==='A'?jogOffA.current+=dx*.9:jogOffB.current+=dx*.9};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };

  const knobDrag=(d:DeckId|null,kind:'trim'|'hi'|'mid'|'low'|'filter'|'master'|'fx')=>async(e:React.PointerEvent<HTMLButtonElement>)=>{
    await ensureGraph();e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const sy=e.clientY;
    const move=(ev:PointerEvent)=>{
      const n=clamp(.5+(sy-ev.clientY)/180,0,1),b=n*2-1,x=d?node(d):null;
      if(kind==='trim'&&x)x.trim.gain.value=.2+n*1.8;
      if(kind==='hi'&&x)x.high.gain.value=b*12;
      if(kind==='mid'&&x)x.mid.gain.value=b*12;
      if(kind==='low'&&x)x.low.gain.value=b*12;
      if(kind==='filter'&&x){if(b<0){x.filter.type='lowpass';x.filter.frequency.value=20000*Math.pow(.025,-b)}else{x.filter.type='highpass';x.filter.frequency.value=30*Math.pow(300,b)}}
      if(kind==='master')setMaster(n);
      if(kind==='fx')setFxDepth(n);
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };

  const tapBpm=(d:DeckId)=>{const bag=d==='A'?tapA:tapB,now=performance.now();bag.current=[...bag.current,now].slice(-5);if(bag.current.length>=2){const ints=bag.current.slice(1).map((v,i)=>v-bag.current[i]),avg=ints.reduce((a,b)=>a+b,0)/ints.length;patch(d,{bpm:clamp(Math.round(60000/avg),50,220)})}};
  const usePad=(d:DeckId,i:number)=>{
    const s=deck(d),a=audio(d);if(!a)return;
    if(s.padMode==='hotcue'){const cues=[...s.hotCues];if(cues[i]===null)cues[i]=a.currentTime;else a.currentTime=cues[i] as number;patch(d,{hotCues:cues})}
    if(s.padMode==='beatjump'){const b=[-8,-4,-2,-1,1,2,4,8][i];a.currentTime=clamp(a.currentTime+b*60/(s.bpm||126),0,a.duration||a.currentTime)}
    if(s.padMode==='beatloop'){const b=[.25,.5,1,2,4,8,16,32][i],len=b*60/(s.bpm||126);patch(d,{loopIn:a.currentTime,loopOut:a.currentTime+len})}
    if(s.padMode==='padfx1'||s.padMode==='padfx2'){setFxOn(true);setFxDepth(s.padMode==='padfx1'?.25+.06*(i%4):.55+.05*(i%4));setTimeout(()=>setFxOn(false),230)}
    if(s.padMode==='sampler'&&s.track?.url){const q=new Audio(s.track.url);q.volume=.6;q.currentTime=s.hotCues[i]??s.cue;q.play().catch(()=>{});setTimeout(()=>q.pause(),350)}
    if(s.padMode==='keyshift')patch(d,{rate:clamp(Math.pow(2,[-4,-3,-2,-1,1,2,3,4][i]/12),.75,1.33)});
    flash(`pad${d}${i}`,160);
  };

  const Hot=({id,cx,cy,w,h,onClick,round=false,onPointerDown}:{id:string,cx:number,cy:number,w:number,h:number,onClick?:()=>void,round?:boolean,onPointerDown?:any})=>(
    <button className={`${styles.hot} ${round?styles.round:''} ${active[id]?styles.lit:''}`}
      style={{left:`${cx-w/2}%`,top:`${cy-h/2}%`,width:`${w}%`,height:`${h}%`}}
      onClick={onClick} onPointerDown={onPointerDown} aria-label={id}/>
  );

  const pA=A.duration?A.time/A.duration:0,pB=B.duration?B.time/B.duration:0;
  const filtered=tracks.filter(t=>`${t.title} ${t.artist||''}`.toLowerCase().includes(query.toLowerCase()));
  const modes1:PadMode[]=['hotcue','padfx1','beatjump','sampler'];
  const modes2:PadMode[]=['keyboard','padfx2','beatloop','keyshift'];

  return <main className={styles.page}>
    <audio ref={aRef} src={A.track?.url||''} onTimeUpdate={()=>timeUpdate('A')} onEnded={()=>patch('A',{playing:false})}/>
    <audio ref={bRef} src={B.track?.url||''} onTimeUpdate={()=>timeUpdate('B')} onEnded={()=>patch('B',{playing:false})}/>
    <input ref={fileA} hidden type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&loadLocal('A',e.target.files[0])}/>
    <input ref={fileB} hidden type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&loadLocal('B',e.target.files[0])}/>

    {loading&&<div className={styles.loader}><div><span>HER9AL WEB DJ</span><h1>Loading DDJ-FLX4</h1><div className={styles.bar}><i style={{width:`${loadingPct}%`}}/></div><b>{loadingPct}%</b></div></div>}

    <header className={styles.header}>
      <div className={styles.deckInfo}><strong>{A.title}</strong><span>{A.artist}</span><div><b>A</b><em>{A.bpm} BPM</em><i>{fmt(A.time)} / {fmt(A.duration)}</i></div><section><Wave peaks={A.peaks} progress={pA}/></section></div>
      <div className={styles.centerWave}><section><Wave peaks={A.peaks} progress={pA}/></section><section><Wave peaks={B.peaks} progress={pB}/></section><div className={styles.playhead}/></div>
      <div className={`${styles.deckInfo} ${styles.right}`}><strong>{B.title}</strong><span>{B.artist}</span><div><b>B</b><em>{B.bpm} BPM</em><i>{fmt(B.time)} / {fmt(B.duration)}</i></div><section><Wave peaks={B.peaks} progress={pB}/></section></div>
    </header>

    <div className={styles.studio}><button onClick={()=>history.back()}>← HER9AL</button><b>STUDIO</b><span>{fxType.toUpperCase()} FX</span></div>

    <section className={styles.stage}><div className={styles.controller}>
      <img src="/dj/flx4-4k.png" className={styles.base} alt="DDJ-FLX4"/>

      <div className={`${styles.jog} ${styles.jogA}`} onPointerDown={dragJog('A')}><img ref={jogA} src="/dj/jog-a.png" alt="" draggable={false}/></div>
      <div className={`${styles.jog} ${styles.jogB}`} onPointerDown={dragJog('B')}><img ref={jogB} src="/dj/jog-b.png" alt="" draggable={false}/></div>

      {/* Accurate top-deck controls measured from the clean 1749x989 image */}
      <Hot id="inA" cx={4.71} cy={11.94} w={3.3} h={5.4} onClick={()=>loopIn('A')} round/>
      <Hot id="outA" cx={10.06} cy={11.84} w={3.3} h={5.4} onClick={()=>loopOut('A')} round/>
      <Hot id="loopA" cx={15.34} cy={11.84} w={3.0} h={4.8} onClick={()=>loop4('A')} round/>
      <Hot id="prevA" cx={20.56} cy={11.84} w={3.0} h={4.8} onClick={()=>resizeLoop('A',.5)} round/>
      <Hot id="nextA" cx={24.88} cy={11.84} w={3.0} h={4.8} onClick={()=>resizeLoop('A',2)} round/>
      <Hot id="syncA" cx={29.93} cy={11.84} w={3.4} h={5.4} onClick={()=>sync('A')} round/>

      <Hot id="inB" cx={69.97} cy={11.94} w={3.3} h={5.4} onClick={()=>loopIn('B')} round/>
      <Hot id="outB" cx={75.25} cy={11.94} w={3.3} h={5.4} onClick={()=>loopOut('B')} round/>
      <Hot id="loopB" cx={80.47} cy={11.84} w={3.0} h={4.8} onClick={()=>loop4('B')} round/>
      <Hot id="prevB" cx={85.76} cy={11.84} w={3.0} h={4.8} onClick={()=>resizeLoop('B',.5)} round/>
      <Hot id="nextB" cx={90.15} cy={11.84} w={3.0} h={4.8} onClick={()=>resizeLoop('B',2)} round/>
      <Hot id="syncB" cx={95.12} cy={11.84} w={3.4} h={5.4} onClick={()=>sync('B')} round/>

      {/* load/back/view */}
      <Hot id="loadA" cx={39.8} cy={7.3} w={4.5} h={5.2} onClick={()=>setLibrary(true)}/>
      <Hot id="back" cx={49.9} cy={6.9} w={4.2} h={5.0} onClick={()=>setLibrary(false)} round/>
      <Hot id="loadB" cx={51.1} cy={7.3} w={4.5} h={5.2} onClick={()=>setLibrary(true)}/>

      {/* mixer knobs: invisible drag zones; the original clean photo is never replaced */}
      <Hot id="trimA" cx={45.83} cy={15.9} w={4.6} h={6.2} onPointerDown={knobDrag('A','trim')} round/>
      <Hot id="trimB" cx={54.09} cy={15.9} w={4.6} h={6.2} onPointerDown={knobDrag('B','trim')} round/>
      <Hot id="hiA" cx={45.83} cy={24.9} w={4.6} h={6.2} onPointerDown={knobDrag('A','hi')} round/>
      <Hot id="hiB" cx={54.09} cy={24.9} w={4.6} h={6.2} onPointerDown={knobDrag('B','hi')} round/>
      <Hot id="midA" cx={45.83} cy={33.8} w={4.6} h={6.2} onPointerDown={knobDrag('A','mid')} round/>
      <Hot id="midB" cx={54.09} cy={33.6} w={4.6} h={6.2} onPointerDown={knobDrag('B','mid')} round/>
      <Hot id="lowA" cx={45.83} cy={42.84} w={4.6} h={6.2} onPointerDown={knobDrag('A','low')} round/>
      <Hot id="lowB" cx={54.09} cy={42.84} w={4.6} h={6.2} onPointerDown={knobDrag('B','low')} round/>
      <Hot id="filterA" cx={45.83} cy={51.76} w={4.6} h={6.2} onPointerDown={knobDrag('A','filter')} round/>
      <Hot id="filterB" cx={54.09} cy={51.86} w={4.6} h={6.2} onPointerDown={knobDrag('B','filter')} round/>
      <Hot id="master" cx={61.69} cy={15.86} w={4.8} h={6.6} onPointerDown={knobDrag(null,'master')} round/>
      <Hot id="fxdepth" cx={61.69} cy={71.93} w={4.8} h={6.6} onPointerDown={knobDrag(null,'fx')} round/>

      {/* channel cues and beat fx */}
      <Hot id="cue1" cx={45.80} cy={60.82} w={4.0} h={3.5} onClick={()=>flash('cue1')}/>
      <Hot id="cue2" cx={54.09} cy={60.82} w={4.0} h={3.5} onClick={()=>flash('cue2')}/>
      <Hot id="smartcfx" cx={38.14} cy={51.62} w={3.8} h={4.5} onClick={()=>setFxOn(v=>!v)} round/>
      <Hot id="smartfader" cx={38.14} cy={82.67} w={3.8} h={4.5} onClick={()=>setFxOn(v=>!v)} round/>
      <Hot id="fxselect" cx={61.6} cy={54.5} w={5.0} h={4.0} onClick={()=>setFxType(v=>v==='delay'?'echo':v==='echo'?'filter':'delay')}/>
      <Hot id="beatminus" cx={59.9} cy={61.1} w={2.7} h={3.3} onClick={()=>setFxBeat(v=>clamp(v/2,.25,4))}/>
      <Hot id="beatplus" cx={63.4} cy={61.1} w={2.7} h={3.3} onClick={()=>setFxBeat(v=>clamp(v*2,.25,4))}/>
      <Hot id="tapA" cx={63.4} cy={64.8} w={3.0} h={3.0} onClick={()=>tapBpm('A')}/>
      <Hot id="tapB" cx={63.4} cy={67.6} w={3.0} h={3.0} onClick={()=>tapBpm('B')}/>
      <Hot id="fxon" cx={61.75} cy={82.75} w={4.8} h={5.5} onClick={()=>setFxOn(v=>!v)} round/>

      {/* transport */}
      <Hot id="cueA" cx={4.75} cy={78.46} w={5.5} h={8.8} onClick={()=>cue('A')} round/>
      <Hot id="playA" cx={4.75} cy={88.47} w={5.5} h={8.8} onClick={()=>playPause('A')} round/>
      <Hot id="cueB" cx={69.93} cy={78.46} w={5.5} h={8.8} onClick={()=>cue('B')} round/>
      <Hot id="playB" cx={69.93} cy={88.68} w={5.5} h={8.8} onClick={()=>playPause('B')} round/>

      {/* shift + tempo range */}
      <Hot id="shiftA" cx={4.7} cy={68.2} w={4.2} h={4.0} onClick={()=>patch('A',{padMode:A.padMode==='hotcue'?'keyboard':'hotcue'})}/>
      <Hot id="shiftB" cx={69.9} cy={68.2} w={4.2} h={4.0} onClick={()=>patch('B',{padMode:B.padMode==='hotcue'?'keyboard':'hotcue'})}/>
      <Hot id="rangeA" cx={29.9} cy={16.8} w={4.5} h={3.0} onClick={()=>tempoRange('A')}/>
      <Hot id="rangeB" cx={95.1} cy={16.8} w={4.5} h={3.0} onClick={()=>tempoRange('B')}/>

      {/* pad mode rows, measured from orange labels */}
      {modes1.map((mode,i)=><Hot key={'m1a'+mode} id={'m1a'+mode} cx={[10.47,15.03,19.65,24.24][i]} cy={74.05} w={4.2} h={2.7} onClick={()=>patch('A',{padMode:mode})}/>)}
      {modes2.map((mode,i)=><Hot key={'m2a'+mode} id={'m2a'+mode} cx={[10.47,15.03,19.65,24.24][i]} cy={76.5} w={4.2} h={2.4} onClick={()=>patch('A',{padMode:mode})}/>)}
      {modes1.map((mode,i)=><Hot key={'m1b'+mode} id={'m1b'+mode} cx={[75.65,80.25,84.85,89.41][i]} cy={74.05} w={4.2} h={2.7} onClick={()=>patch('B',{padMode:mode})}/>)}
      {modes2.map((mode,i)=><Hot key={'m2b'+mode} id={'m2b'+mode} cx={[75.65,80.25,84.85,89.41][i]} cy={76.5} w={4.2} h={2.4} onClick={()=>patch('B',{padMode:mode})}/>)}

      {/* pads */}
      {[10.48,15.04,19.64,24.24].map((x,i)=><Hot key={'paT'+i} id={'padA'+i} cx={x} cy={82.35} w={4.0} h={6.6} onClick={()=>usePad('A',i)}/>)}
      {[10.48,15.04,19.64,24.24].map((x,i)=><Hot key={'paB'+i} id={'padA'+(i+4)} cx={x} cy={90.49} w={4.0} h={6.6} onClick={()=>usePad('A',i+4)}/>)}
      {[75.65,80.25,84.85,89.41].map((x,i)=><Hot key={'pbT'+i} id={'padB'+i} cx={x} cy={82.35} w={4.0} h={6.6} onClick={()=>usePad('B',i)}/>)}
      {[75.65,80.25,84.85,89.41].map((x,i)=><Hot key={'pbB'+i} id={'padB'+(i+4)} cx={x} cy={90.49} w={4.0} h={6.6} onClick={()=>usePad('B',i+4)}/>)}

      {/* invisible faders, centered on the actual photo tracks */}
      <input className={`${styles.vRange} ${styles.tempoA}`} type="range" min={1-A.tempoRange} max={1+A.tempoRange} step=".001" value={A.rate} onChange={e=>patch('A',{rate:Number(e.target.value)})}/>
      <input className={`${styles.vRange} ${styles.tempoB}`} type="range" min={1-B.tempoRange} max={1+B.tempoRange} step=".001" value={B.rate} onChange={e=>patch('B',{rate:Number(e.target.value)})}/>
      <input className={`${styles.vRange} ${styles.chA}`} type="range" min="0" max="1" step=".01" value={A.channel} onChange={e=>patch('A',{channel:Number(e.target.value)})}/>
      <input className={`${styles.vRange} ${styles.chB}`} type="range" min="0" max="1" step=".01" value={B.channel} onChange={e=>patch('B',{channel:Number(e.target.value)})}/>
      <input className={styles.cross} type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/>

      <button className={styles.storeA} onDoubleClick={()=>saveCue('A')} aria-label="store cue A"/>
      <button className={styles.storeB} onDoubleClick={()=>saveCue('B')} aria-label="store cue B"/>
    </div></section>

    <button className={styles.flag}>⚑</button>
    <nav className={styles.dock}><button onClick={()=>setLibrary(v=>!v)}>♫ Music Library</button><button className={styles.selected}>♬ DDJ-FLX4</button><button onClick={()=>setSettings(v=>!v)}>⚙ Settings</button></nav>
    <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

    {library&&<aside className={styles.drawer}><div className={styles.drawerHead}><div><small>HER9AL</small><h2>Music Library</h2></div><button onClick={()=>setLibrary(false)}>×</button></div>
      <input className={styles.search} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tracks..."/>
      <div className={styles.local}><button onClick={()=>fileA.current?.click()}>Load local → Deck A</button><button onClick={()=>fileB.current?.click()}>Load local → Deck B</button></div>
      <div className={styles.list}>{filtered.map((t,i)=><div key={t.id||i}><span><b>{t.title}</b><small>{t.artist||'HER9AL'} · {t.bpm||126} BPM</small></span><button onClick={()=>loadTrack('A',t)}>A</button><button onClick={()=>loadTrack('B',t)}>B</button></div>)}{!filtered.length&&<p>No published DJ tracks yet.</p>}</div>
    </aside>}

    {settings&&<aside className={`${styles.drawer} ${styles.settings}`}><div className={styles.drawerHead}><div><small>HER9AL</small><h2>Settings</h2></div><button onClick={()=>setSettings(false)}>×</button></div>
      <label>Master<input type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/></label>
      <label>FX depth<input type="range" min="0" max="1" step=".01" value={fxDepth} onChange={e=>setFxDepth(Number(e.target.value))}/></label>
    </aside>}
  </main>;
}
