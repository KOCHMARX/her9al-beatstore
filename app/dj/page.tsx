'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A' | 'B';
type Deck = {
  url:string; title:string; artist:string; bpm:number;
  playing:boolean; time:number; duration:number; cue:number;
  rate:number; channel:number; loopIn:number|null; loopOut:number|null;
  peaks:number[];
};

const fresh=():Deck=>({
  url:'',title:'NO TRACK LOADED',artist:'HER9AL',bpm:126,
  playing:false,time:0,duration:0,cue:0,rate:1,channel:.9,
  loopIn:null,loopOut:null,peaks:[]
});

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

function fmt(v:number){
  if(!Number.isFinite(v))return '00:00';
  const m=Math.floor(v/60),s=Math.floor(v%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function Wave({
  peaks, progress, mini=false
}:{peaks:number[],progress:number,mini?:boolean}){
  const ref=useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const c=ref.current;if(!c)return;
    const rect=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
    c.width=Math.max(1,Math.floor(rect.width*dpr));
    c.height=Math.max(1,Math.floor(rect.height*dpr));
    const x=c.getContext('2d');if(!x)return;
    x.setTransform(dpr,0,0,dpr,0,0);
    x.clearRect(0,0,rect.width,rect.height);

    const p=peaks.length?peaks:Array.from({length:220},(_,i)=>.1+.55*Math.abs(Math.sin(i*.23)*Math.cos(i*.061)));
    const bw=rect.width/p.length;
    for(let i=0;i<p.length;i++){
      const h=Math.max(1,p[i]*rect.height*(mini?.82:.9));
      const active=i/p.length<=progress;
      x.fillStyle=active?'#4ca5ff':'#2a5f8f';
      x.fillRect(i*bw,(rect.height-h)/2,Math.max(1,bw*.68),h);
    }
  },[peaks,progress,mini]);

  return <canvas ref={ref} className={styles.waveCanvas}/>;
}

export default function DJStudio(){
  const aRef=useRef<HTMLAudioElement>(null);
  const bRef=useRef<HTMLAudioElement>(null);
  const fileA=useRef<HTMLInputElement>(null);
  const fileB=useRef<HTMLInputElement>(null);

  const ctxRef=useRef<AudioContext|null>(null);
  const masterRef=useRef<GainNode|null>(null);
  const nodesA=useRef<any>(null);
  const nodesB=useRef<any>(null);

  const [A,setA]=useState<Deck>(fresh());
  const [B,setB]=useState<Deck>(fresh());
  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(.92);
  const [library,setLibrary]=useState(false);
  const [settings,setSettings]=useState(false);
  const [scale,setScale]=useState(1);
  const [jogA,setJogA]=useState(0);
  const [jogB,setJogB]=useState(0);
  const [active,setActive]=useState<Record<string,boolean>>({});
  const [angles,setAngles]=useState<Record<string,number>>({
    trimA:0,trimB:0,hiA:0,hiB:0,midA:0,midB:0,
    lowA:0,lowB:0,filterA:0,filterB:0,master:0,fx:0
  });

  const el=(d:DeckId)=>d==='A'?aRef.current:bRef.current;
  const deck=(d:DeckId)=>d==='A'?A:B;
  const patch=(d:DeckId,p:Partial<Deck>)=>d==='A'?setA(v=>({...v,...p})):setB(v=>({...v,...p}));
  const nodes=(d:DeckId)=>d==='A'?nodesA.current:nodesB.current;

  useEffect(()=>{
    const resize=()=>setScale(Math.min(window.innerWidth/1351,window.innerHeight/630));
    resize();window.addEventListener('resize',resize);
    return()=>window.removeEventListener('resize',resize);
  },[]);

  useEffect(()=>{
    fetch('/api/auth/session',{cache:'no-store'})
      .then(r=>{if(r.status===401)location.href='/login'})
      .catch(()=>{});
  },[]);

  const flash=(id:string,ms=150)=>{
    setActive(v=>({...v,[id]:true}));
    setTimeout(()=>setActive(v=>({...v,[id]:false})),ms);
  };

  const ensureGraph=async()=>{
    if(!aRef.current||!bRef.current)return;
    if(!ctxRef.current){
      const ctx=new AudioContext();ctxRef.current=ctx;
      const masterGain=ctx.createGain();masterGain.gain.value=master;masterGain.connect(ctx.destination);masterRef.current=masterGain;

      const make=(media:HTMLMediaElement)=>{
        const source=ctx.createMediaElementSource(media);
        const trim=ctx.createGain();
        const low=ctx.createBiquadFilter();low.type='lowshelf';low.frequency.value=240;
        const mid=ctx.createBiquadFilter();mid.type='peaking';mid.frequency.value=1200;mid.Q.value=.75;
        const high=ctx.createBiquadFilter();high.type='highshelf';high.frequency.value=4800;
        const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=20000;
        const channel=ctx.createGain();channel.gain.value=.9;
        const crossNode=ctx.createGain();

        source.connect(trim);trim.connect(low);low.connect(mid);mid.connect(high);high.connect(filter);filter.connect(channel);channel.connect(crossNode);crossNode.connect(masterGain);
        return{source,trim,low,mid,high,filter,channel,cross:crossNode};
      };
      nodesA.current=make(aRef.current);nodesB.current=make(bRef.current);
    }
    if(ctxRef.current.state==='suspended')await ctxRef.current.resume();
  };

  useEffect(()=>{if(masterRef.current)masterRef.current.gain.value=master},[master]);
  useEffect(()=>{
    if(nodesA.current)nodesA.current.channel.gain.value=A.channel;
    if(nodesB.current)nodesB.current.channel.gain.value=B.channel;
  },[A.channel,B.channel]);
  useEffect(()=>{
    const l=cross<=0?1:1-cross,r=cross>=0?1:1+cross;
    if(nodesA.current)nodesA.current.cross.gain.value=l;
    if(nodesB.current)nodesB.current.cross.gain.value=r;
  },[cross]);
  useEffect(()=>{if(aRef.current)aRef.current.playbackRate=A.rate},[A.rate]);
  useEffect(()=>{if(bRef.current)bRef.current.playbackRate=B.rate},[B.rate]);

  const peaks=async(file:File)=>{
    try{
      const ctx=ctxRef.current||new AudioContext();
      const data=await file.arrayBuffer();
      const buf=await ctx.decodeAudioData(data.slice(0));
      const ch=buf.getChannelData(0), bins=300, size=Math.max(1,Math.floor(ch.length/bins));
      const out:number[]=[];
      for(let i=0;i<bins;i++){
        let m=0;
        for(let j=i*size;j<Math.min(ch.length,(i+1)*size);j+=Math.max(1,Math.floor(size/64)))m=Math.max(m,Math.abs(ch[j]));
        out.push(Math.max(.02,m));
      }
      return out;
    }catch{return[]}
  };

  const load=async(d:DeckId,file:File)=>{
    await ensureGraph();
    const p=await peaks(file),url=URL.createObjectURL(file);
    patch(d,{url,title:file.name,artist:'Local file',playing:false,time:0,duration:0,cue:0,rate:1,loopIn:null,loopOut:null,peaks:p});
    setLibrary(false);setTimeout(()=>el(d)?.load(),0);
  };

  const playPause=async(d:DeckId)=>{
    await ensureGraph();const a=el(d);if(!a||!deck(d).url)return;
    flash(`play${d}`,220);
    if(a.paused){await a.play();patch(d,{playing:true})}else{a.pause();patch(d,{playing:false})}
  };

  const cue=(d:DeckId)=>{const a=el(d);if(!a)return;a.pause();a.currentTime=deck(d).cue;patch(d,{playing:false});flash(`cue${d}`,220)};
  const saveCue=(d:DeckId)=>{const a=el(d);if(!a)return;patch(d,{cue:a.currentTime});flash(`cue${d}`,400)};
  const sync=(d:DeckId)=>{const bpm=(d==='A'?B:A).bpm||126;patch(d,{bpm,rate:clamp(bpm/126,.84,1.16)});flash(`sync${d}`,260)};
  const loop4=(d:DeckId)=>{const a=el(d);if(!a)return;const len=4*60/(deck(d).bpm||126);patch(d,{loopIn:a.currentTime,loopOut:a.currentTime+len});flash(`loop${d}`,260)};
  const timeUpdate=(d:DeckId)=>{const a=el(d);if(!a)return;const s=deck(d);if(s.loopIn!==null&&s.loopOut!==null&&a.currentTime>=s.loopOut)a.currentTime=s.loopIn;patch(d,{time:a.currentTime,duration:a.duration||0})};

  const jog=(d:DeckId)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);let px=e.clientX;
    const move=(ev:PointerEvent)=>{
      const dx=ev.clientX-px;px=ev.clientX;const a=el(d);
      if(a&&Number.isFinite(a.duration))a.currentTime=clamp(a.currentTime+dx*.025,0,a.duration);
      d==='A'?setJogA(v=>v+dx*.9):setJogB(v=>v+dx*.9);
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };

  const applyKnob=(id:string,angle:number)=>{
    const norm=(angle+135)/270,bip=norm*2-1;
    const d:DeckId|null=id.endsWith('A')?'A':id.endsWith('B')?'B':null,n=d?nodes(d):null;
    if(id.startsWith('trim')&&n)n.trim.gain.value=.2+norm*1.8;
    if(id.startsWith('low')&&n)n.low.gain.value=bip*12;
    if(id.startsWith('mid')&&n)n.mid.gain.value=bip*12;
    if(id.startsWith('hi')&&n)n.high.gain.value=bip*12;
    if(id.startsWith('filter')&&n){
      if(bip<0){n.filter.type='lowpass';n.filter.frequency.value=20000*Math.pow(.025,-bip)}
      else{n.filter.type='highpass';n.filter.frequency.value=30*Math.pow(300,bip)}
    }
    if(id==='master')setMaster(norm);
  };

  const knobDrag=(id:string)=>async(e:React.PointerEvent<HTMLDivElement>)=>{
    await ensureGraph();e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    const sy=e.clientY,start=angles[id]||0;
    const move=(ev:PointerEvent)=>{const a=clamp(start+(sy-ev.clientY)*1.05,-135,135);setAngles(v=>({...v,[id]:a}));applyKnob(id,a)};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };

  const Hit=({id,x,y,w,h,onClick,round=false}:{id:string,x:number,y:number,w:number,h:number,onClick:()=>void,round?:boolean})=>
    <button className={`${styles.hit} ${round?styles.round:''} ${active[id]?styles.lit:''}`} style={{left:x,top:y,width:w,height:h}} onClick={onClick} aria-label={id}/>;

  const Knob=({id,src,x,y,size}:{id:string,src:string,x:number,y:number,size:number})=>
    <div className={styles.knob} style={{left:x,top:y,width:size,height:size}} onPointerDown={knobDrag(id)} aria-label={id}>
      <img src={src} alt="" draggable={false} style={{transform:`rotate(${angles[id]||0}deg)`}}/>
    </div>;

  const pA=A.duration?A.time/A.duration:0,pB=B.duration?B.time/B.duration:0;

  return <main className={styles.viewport}>
    <audio ref={aRef} src={A.url} onTimeUpdate={()=>timeUpdate('A')} onEnded={()=>patch('A',{playing:false})}/>
    <audio ref={bRef} src={B.url} onTimeUpdate={()=>timeUpdate('B')} onEnded={()=>patch('B',{playing:false})}/>
    <input ref={fileA} hidden type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&load('A',e.target.files[0])}/>
    <input ref={fileB} hidden type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&load('B',e.target.files[0])}/>

    <div className={styles.canvas} style={{transform:`translate(-50%,-50%) scale(${scale})`}}>
      <img src="/dj/tribe-layout-clean.png" className={styles.layout} alt=""/>

      <div className={styles.leftMeta}>
        <strong>{A.title}</strong><span>{A.artist}</span>
        <div><b>{A.bpm}</b><em>{fmt(A.time)} / {fmt(A.duration)}</em></div>
      </div>
      <div className={styles.leftWave}><Wave peaks={A.peaks} progress={pA} mini/></div>

      <div className={styles.rightMeta}>
        <strong>{B.title}</strong><span>{B.artist}</span>
        <div><b>{B.bpm}</b><em>{fmt(B.time)} / {fmt(B.duration)}</em></div>
      </div>
      <div className={styles.rightWave}><Wave peaks={B.peaks} progress={pB} mini/></div>

      <div className={styles.centerTopWave}><Wave peaks={A.peaks} progress={pA}/></div>
      <div className={styles.centerBottomWave}><Wave peaks={B.peaks} progress={pB}/></div>
      <div className={styles.centerLine}/>

      <button className={styles.home} onClick={()=>history.back()}>← HER9AL</button>
      <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

      <div className={styles.controller}>
        <div className={`${styles.jog} ${styles.jogA}`} onPointerDown={jog('A')}>
          <img src="/dj/jog-a.png" alt="" draggable={false} style={{transform:`rotate(${jogA}deg)`}}/>
        </div>
        <div className={`${styles.jog} ${styles.jogB}`} onPointerDown={jog('B')}>
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
        <Knob id="fx" src="/dj/fx.png" x={511} y={309} size={38}/>

        <Hit id="loadA" x={349} y={8} w={42} h={27} onClick={()=>fileA.current?.click()}/>
        <Hit id="loadB" x={421} y={8} w={42} h={27} onClick={()=>fileB.current?.click()}/>
        <Hit id="cueA" x={16} y={350} w={49} h={49} onClick={()=>cue('A')} round/>
        <Hit id="playA" x={16} y={402} w={49} h={49} onClick={()=>playPause('A')} round/>
        <Hit id="cueB" x={577} y={350} w={49} h={49} onClick={()=>cue('B')} round/>
        <Hit id="playB" x={577} y={402} w={49} h={49} onClick={()=>playPause('B')} round/>
        <Hit id="syncA" x={222} y={25} w={42} h={29} onClick={()=>sync('A')} round/>
        <Hit id="syncB" x={784} y={25} w={42} h={29} onClick={()=>sync('B')} round/>
        <Hit id="loopA" x={128} y={26} w={62} h={28} onClick={()=>loop4('A')}/>
        <Hit id="loopB" x={690} y={26} w={62} h={28} onClick={()=>loop4('B')}/>

        {Array.from({length:8}).map((_,i)=>
          <Hit key={'a'+i} id={'padA'+i} x={73+(i%4)*43} y={373+Math.floor(i/4)*39} w={38} h={35} onClick={()=>flash('padA'+i,180)}/>
        )}
        {Array.from({length:8}).map((_,i)=>
          <Hit key={'b'+i} id={'padB'+i} x={635+(i%4)*43} y={373+Math.floor(i/4)*39} w={38} h={35} onClick={()=>flash('padB'+i,180)}/>
        )}

        <input className={`${styles.vRange} ${styles.tempoA}`} type="range" min=".84" max="1.16" step=".001" value={A.rate} onChange={e=>patch('A',{rate:Number(e.target.value)})}/>
        <input className={`${styles.vRange} ${styles.tempoB}`} type="range" min=".84" max="1.16" step=".001" value={B.rate} onChange={e=>patch('B',{rate:Number(e.target.value)})}/>
        <input className={`${styles.vRange} ${styles.channelA}`} type="range" min="0" max="1" step=".01" value={A.channel} onChange={e=>patch('A',{channel:Number(e.target.value)})}/>
        <input className={`${styles.vRange} ${styles.channelB}`} type="range" min="0" max="1" step=".01" value={B.channel} onChange={e=>patch('B',{channel:Number(e.target.value)})}/>
        <input className={styles.cross} type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/>

        <button className={styles.storeCueA} onDoubleClick={()=>saveCue('A')} aria-label="store cue A"/>
        <button className={styles.storeCueB} onDoubleClick={()=>saveCue('B')} aria-label="store cue B"/>
      </div>

      <button className={styles.libraryButton} onClick={()=>setLibrary(v=>!v)}>♫ Music Library</button>
      <button className={styles.settingsButton} onClick={()=>setSettings(v=>!v)}>⚙ Settings</button>

      {library&&<aside className={styles.drawer}>
        <div className={styles.drawerHead}><div><small>HER9AL</small><h2>Music Library</h2></div><button onClick={()=>setLibrary(false)}>×</button></div>
        <div className={styles.loadGrid}>
          <button onClick={()=>fileA.current?.click()}><b>LOAD A</b><span>MP3 / WAV / M4A</span></button>
          <button onClick={()=>fileB.current?.click()}><b>LOAD B</b><span>MP3 / WAV / M4A</span></button>
        </div>
      </aside>}

      {settings&&<aside className={`${styles.drawer} ${styles.settings}`}>
        <div className={styles.drawerHead}><div><small>HER9AL</small><h2>Settings</h2></div><button onClick={()=>setSettings(false)}>×</button></div>
        <label>Master output<input type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/></label>
      </aside>}
    </div>
  </main>
}
