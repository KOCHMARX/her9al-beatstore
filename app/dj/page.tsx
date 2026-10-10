'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A'|'B';
type Deck = {
  url:string; title:string; artist:string; bpm:number; playing:boolean;
  time:number; duration:number; cue:number; rate:number; channel:number;
  loopIn:number|null; loopOut:number|null;
};

const fresh=():Deck=>({
  url:'',title:'NO TRACK LOADED',artist:'HER9AL',bpm:126,playing:false,
  time:0,duration:0,cue:0,rate:1,channel:.92,loopIn:null,loopOut:null
});

function fmt(v:number){
  if(!Number.isFinite(v))return '00:00';
  const m=Math.floor(v/60),s=Math.floor(v%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export default function DJStudio(){
  const aRef=useRef<HTMLAudioElement>(null);
  const bRef=useRef<HTMLAudioElement>(null);
  const [A,setA]=useState<Deck>(fresh());
  const [B,setB]=useState<Deck>(fresh());
  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(.95);
  const [library,setLibrary]=useState(false);
  const [settings,setSettings]=useState(false);
  const [lit,setLit]=useState<Record<string,boolean>>({});
  const [jogA,setJogA]=useState(0);
  const [jogB,setJogB]=useState(0);
  const [knobs,setKnobs]=useState<Record<string,number>>({
    trimA:0,hiA:0,midA:0,lowA:0,filterA:0,
    trimB:0,hiB:0,midB:0,lowB:0,filterB:0,
    master:0,fx:0
  });

  const el=(d:DeckId)=>d==='A'?aRef.current:bRef.current;
  const deck=(d:DeckId)=>d==='A'?A:B;
  const patch=(d:DeckId,p:Partial<Deck>)=>d==='A'?setA(v=>({...v,...p})):setB(v=>({...v,...p}));

  const flash=(id:string,ms=170)=>{
    setLit(v=>({...v,[id]:true}));
    setTimeout(()=>setLit(v=>({...v,[id]:false})),ms);
  };

  const gains=useMemo(()=>({
    a:Math.max(0,Math.min(1,master*A.channel*(cross<=0?1:1-cross))),
    b:Math.max(0,Math.min(1,master*B.channel*(cross>=0?1:1+cross)))
  }),[master,A.channel,B.channel,cross]);

  useEffect(()=>{if(aRef.current)aRef.current.volume=gains.a},[gains.a]);
  useEffect(()=>{if(bRef.current)bRef.current.volume=gains.b},[gains.b]);
  useEffect(()=>{if(aRef.current)aRef.current.playbackRate=A.rate},[A.rate]);
  useEffect(()=>{if(bRef.current)bRef.current.playbackRate=B.rate},[B.rate]);

  const loadFile=(d:DeckId,file:File)=>{
    const url=URL.createObjectURL(file);
    patch(d,{url,title:file.name,artist:'Local file',playing:false,time:0,duration:0,cue:0,rate:1,loopIn:null,loopOut:null});
    setLibrary(false);
    setTimeout(()=>el(d)?.load(),0);
  };

  const playPause=async(d:DeckId)=>{
    const a=el(d); if(!a||!deck(d).url)return;
    flash(`play${d}`,240);
    if(a.paused){await a.play();patch(d,{playing:true})}
    else{a.pause();patch(d,{playing:false})}
  };

  const cue=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    a.pause();a.currentTime=deck(d).cue;patch(d,{playing:false});flash(`cue${d}`,250)
  };
  const setCue=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    patch(d,{cue:a.currentTime});flash(`cue${d}`,450)
  };
  const sync=(d:DeckId)=>{
    const target=(d==='A'?B:A).bpm||126;
    patch(d,{bpm:target,rate:target/126});flash(`sync${d}`,300)
  };
  const loop4=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    const len=4*60/(deck(d).bpm||126);
    patch(d,{loopIn:a.currentTime,loopOut:a.currentTime+len});flash(`loop${d}`,300)
  };
  const onTime=(d:DeckId)=>{
    const a=el(d);if(!a)return;
    const s=deck(d);
    if(s.loopIn!==null&&s.loopOut!==null&&a.currentTime>=s.loopOut)a.currentTime=s.loopIn;
    patch(d,{time:a.currentTime,duration:a.duration||0})
  };

  const jogDrag=(d:DeckId)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    let px=e.clientX;
    const move=(ev:PointerEvent)=>{
      const dx=ev.clientX-px;px=ev.clientX;
      const a=el(d);
      if(a&&Number.isFinite(a.duration))a.currentTime=Math.max(0,Math.min(a.duration,a.currentTime+dx*.032));
      d==='A'?setJogA(v=>v+dx):setJogB(v=>v+dx);
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)
  };

  const knobDrag=(id:string)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    const sy=e.clientY,start=knobs[id]||0;
    const move=(ev:PointerEvent)=>{
      const n=Math.max(-135,Math.min(135,start+(sy-ev.clientY)*1.2));
      setKnobs(v=>({...v,[id]:n}));
      if(id==='master')setMaster((n+135)/270)
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)
  };

  const Hit=({id,x,y,w,h,onClick,round=false}:{id:string,x:number,y:number,w:number,h:number,onClick:()=>void,round?:boolean})=>
    <button
      className={`${styles.hit} ${round?styles.round:''} ${lit[id]?styles.lit:''}`}
      style={{left:`${x}%`,top:`${y}%`,width:`${w}%`,height:`${h}%`}}
      onClick={onClick}
      aria-label={id}
    />;

  const Knob=({id,x,y,s=4}:{id:string,x:number,y:number,s?:number})=>
    <div className={styles.knobHit} style={{left:`${x}%`,top:`${y}%`,width:`${s}%`}} onPointerDown={knobDrag(id)}>
      <i style={{transform:`translateX(-50%) rotate(${knobs[id]||0}deg)`}}/>
    </div>;

  return <main className={styles.page}>
    <audio ref={aRef} src={A.url} onTimeUpdate={()=>onTime('A')} onEnded={()=>patch('A',{playing:false})}/>
    <audio ref={bRef} src={B.url} onTimeUpdate={()=>onTime('B')} onEnded={()=>patch('B',{playing:false})}/>

    <header className={styles.waveTop}>
      <div className={styles.deckInfo}>
        <strong>{A.title}</strong><span>{A.artist}</span>
        <div><b>{A.bpm}</b> BPM <em>{fmt(A.time)} / {fmt(A.duration)}</em></div>
        <div className={styles.miniWave}/>
      </div>
      <div className={styles.centerWave}>
        <div className={styles.waveLine}/>
        <div className={styles.waveLine2}/>
        <div className={styles.playhead}/>
      </div>
      <div className={`${styles.deckInfo} ${styles.right}`}>
        <strong>{B.title}</strong><span>{B.artist}</span>
        <div><b>{B.bpm}</b> BPM <em>{fmt(B.time)} / {fmt(B.duration)}</em></div>
        <div className={styles.miniWave}/>
      </div>
    </header>

    <div className={styles.studioBar}>
      <button onClick={()=>history.back()}>← Learning Dojo</button>
      <b>STUDIO</b>
      <span>HER9AL Web DJ</span>
    </div>

    <section className={styles.stage}>
      <div className={styles.controller}>
        <img className={styles.base} src="/ddj-flx4-pro.png" alt="DDJ-FLX4"/>

        <div className={`${styles.jog} ${A.playing?styles.spin:''}`} style={{left:'3.3%',top:'17.2%',transform:`rotate(${jogA}deg)`}} onPointerDown={jogDrag('A')}>
          <img src="/jog-left.png" alt=""/>
        </div>
        <div className={`${styles.jog} ${B.playing?styles.spin:''}`} style={{left:'68.0%',top:'17.2%',transform:`rotate(${jogB}deg)`}} onPointerDown={jogDrag('B')}>
          <img src="/jog-right.png" alt=""/>
        </div>

        <Knob id="trimA" x={44.7} y={13.9}/>
        <Knob id="trimB" x={53.3} y={13.9}/>
        <Knob id="hiA" x={44.7} y={22.0}/>
        <Knob id="hiB" x={53.3} y={22.0}/>
        <Knob id="midA" x={44.7} y={30.0}/>
        <Knob id="midB" x={53.3} y={30.0}/>
        <Knob id="lowA" x={44.7} y={38.1}/>
        <Knob id="lowB" x={53.3} y={38.1}/>
        <Knob id="filterA" x={44.7} y={46.4}/>
        <Knob id="filterB" x={53.3} y={46.4}/>
        <Knob id="master" x={61.2} y={14.3} s={4.4}/>
        <Knob id="fx" x={61.2} y={64.0} s={4.4}/>

        <Hit id="cueA" x={0.8} y={66.8} w={6.1} h={9.2} onClick={()=>cue('A')} round/>
        <Hit id="playA" x={0.8} y={77.9} w={6.1} h={9.2} onClick={()=>playPause('A')} round/>
        <Hit id="cueB" x={67.3} y={66.8} w={6.1} h={9.2} onClick={()=>cue('B')} round/>
        <Hit id="playB" x={67.3} y={77.9} w={6.1} h={9.2} onClick={()=>playPause('B')} round/>
        <Hit id="syncA" x={24.8} y={6.0} w={4.7} h={5.4} onClick={()=>sync('A')} round/>
        <Hit id="syncB" x={91.0} y={6.0} w={4.7} h={5.4} onClick={()=>sync('B')} round/>
        <Hit id="loopA" x={12.0} y={5.0} w={9.6} h={5.7} onClick={()=>loop4('A')}/>
        <Hit id="loopB" x={79.0} y={5.0} w={9.6} h={5.7} onClick={()=>loop4('B')}/>
        <Hit id="loadA" x={41.1} y={0.8} w={4.8} h={5.0} onClick={()=>setLibrary(true)}/>
        <Hit id="loadB" x={54.0} y={0.8} w={4.8} h={5.0} onClick={()=>setLibrary(true)}/>

        {Array.from({length:8}).map((_,i)=><Hit key={'a'+i} id={'padA'+i}
          x={7.2+(i%4)*4.7} y={73.3+Math.floor(i/4)*8.1} w={4.2} h={6.6}
          onClick={()=>flash('padA'+i,200)}/>)}
        {Array.from({length:8}).map((_,i)=><Hit key={'b'+i} id={'padB'+i}
          x={74.2+(i%4)*4.7} y={73.3+Math.floor(i/4)*8.1} w={4.2} h={6.6}
          onClick={()=>flash('padB'+i,200)}/>)}

        <div className={`${styles.sliderZone} ${styles.tempoA}`}>
          <input type="range" min=".84" max="1.16" step=".001" value={A.rate} onChange={e=>patch('A',{rate:Number(e.target.value)})}/>
        </div>
        <div className={`${styles.sliderZone} ${styles.tempoB}`}>
          <input type="range" min=".84" max="1.16" step=".001" value={B.rate} onChange={e=>patch('B',{rate:Number(e.target.value)})}/>
        </div>
        <div className={`${styles.sliderZone} ${styles.chA}`}>
          <input type="range" min="0" max="1" step=".01" value={A.channel} onChange={e=>patch('A',{channel:Number(e.target.value)})}/>
        </div>
        <div className={`${styles.sliderZone} ${styles.chB}`}>
          <input type="range" min="0" max="1" step=".01" value={B.channel} onChange={e=>patch('B',{channel:Number(e.target.value)})}/>
        </div>
        <div className={styles.crossZone}>
          <input type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/>
        </div>

        <button className={styles.cueStoreA} onDoubleClick={()=>setCue('A')} aria-label="Store cue A"/>
        <button className={styles.cueStoreB} onDoubleClick={()=>setCue('B')} aria-label="Store cue B"/>
      </div>
    </section>

    <nav className={styles.dock}>
      <button onClick={()=>setLibrary(v=>!v)}>♫ Music Library</button>
      <button>♬ DDJ-FLX4</button>
      <button onClick={()=>setSettings(v=>!v)}>⚙ Settings</button>
    </nav>

    <div className={styles.flag}>⚑</div>
    <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

    {library&&<aside className={styles.drawer}>
      <div className={styles.drawerHead}><div><small>HER9AL</small><h2>Music Library</h2></div><button onClick={()=>setLibrary(false)}>×</button></div>
      <div className={styles.loadGrid}>
        <label><strong>LOAD DECK A</strong><span>MP3 / WAV / M4A</span><input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&loadFile('A',e.target.files[0])}/></label>
        <label><strong>LOAD DECK B</strong><span>MP3 / WAV / M4A</span><input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&loadFile('B',e.target.files[0])}/></label>
      </div>
    </aside>}

    {settings&&<aside className={`${styles.drawer} ${styles.settings}`}>
      <div className={styles.drawerHead}><div><small>HER9AL</small><h2>Settings</h2></div><button onClick={()=>setSettings(false)}>×</button></div>
      <label>Master output<input type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/></label>
      <p>Drag jog wheels horizontally. Drag mixer knobs vertically. Double-click CUE to save a cue point.</p>
    </aside>}
  </main>
}
