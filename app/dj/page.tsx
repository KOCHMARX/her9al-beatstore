'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A' | 'B';
type Deck = {
  name: string;
  artist: string;
  url: string;
  bpm: number;
  playing: boolean;
  time: number;
  duration: number;
  cue: number;
  rate: number;
  channel: number;
  loopIn: number | null;
  loopOut: number | null;
};

const fresh = (): Deck => ({
  name: 'NO TRACK LOADED',
  artist: 'HER9AL',
  url: '',
  bpm: 126,
  playing: false,
  time: 0,
  duration: 0,
  cue: 0,
  rate: 1,
  channel: .9,
  loopIn: null,
  loopOut: null,
});

function fmt(n:number){
  if(!Number.isFinite(n)) return '00:00';
  const m=Math.floor(n/60), s=Math.floor(n%60);
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

  const [jogA,setJogA]=useState(0);
  const [jogB,setJogB]=useState(0);
  const [pressed,setPressed]=useState<Record<string,boolean>>({});

  const [knob,setKnob]=useState<Record<string,number>>({
    trimA:0,hiA:0,midA:0,lowA:0,filterA:0,
    trimB:0,hiB:0,midB:0,lowB:0,filterB:0,
    master:0,fx:0
  });

  const el=(d:DeckId)=>d==='A'?aRef.current:bRef.current;
  const deck=(d:DeckId)=>d==='A'?A:B;
  const patch=(d:DeckId,p:Partial<Deck>)=>{
    if(d==='A') setA(v=>({...v,...p}));
    else setB(v=>({...v,...p}));
  };

  const flash=(id:string,ms=180)=>{
    setPressed(v=>({...v,[id]:true}));
    window.setTimeout(()=>setPressed(v=>({...v,[id]:false})),ms);
  };

  const gains=useMemo(()=>({
    a: Math.max(0,Math.min(1,master*A.channel*(cross<=0?1:1-cross))),
    b: Math.max(0,Math.min(1,master*B.channel*(cross>=0?1:1+cross))),
  }),[master,A.channel,B.channel,cross]);

  useEffect(()=>{ if(aRef.current) aRef.current.volume=gains.a; },[gains.a]);
  useEffect(()=>{ if(bRef.current) bRef.current.volume=gains.b; },[gains.b]);
  useEffect(()=>{ if(aRef.current) aRef.current.playbackRate=A.rate; },[A.rate]);
  useEffect(()=>{ if(bRef.current) bRef.current.playbackRate=B.rate; },[B.rate]);

  const loadFile=(d:DeckId,file:File)=>{
    const url=URL.createObjectURL(file);
    patch(d,{name:file.name,artist:'Local file',url,time:0,duration:0,cue:0,playing:false,rate:1,loopIn:null,loopOut:null});
    setLibrary(false);
    setTimeout(()=>el(d)?.load(),0);
  };

  const play=(d:DeckId)=>async()=>{
    const audio=el(d);
    if(!audio || !deck(d).url) return;
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
    const audio=el(d); if(!audio) return;
    audio.pause();
    audio.currentTime=deck(d).cue;
    patch(d,{playing:false});
    flash(`cue${d}`,220);
  };

  const setCue=(d:DeckId)=>{
    const audio=el(d); if(!audio) return;
    patch(d,{cue:audio.currentTime});
    flash(`cue${d}`,420);
  };

  const sync=(d:DeckId)=>{
    const other=d==='A'?B:A;
    const target=other.bpm||126;
    patch(d,{bpm:target,rate:target/126});
    flash(`sync${d}`,300);
  };

  const loop4=(d:DeckId)=>{
    const audio=el(d); if(!audio) return;
    const len=(4*60)/(deck(d).bpm||126);
    patch(d,{loopIn:audio.currentTime,loopOut:audio.currentTime+len});
    flash(`loop${d}`,300);
  };

  const timeUpdate=(d:DeckId)=>{
    const audio=el(d); if(!audio) return;
    const s=deck(d);
    if(s.loopIn!==null && s.loopOut!==null && audio.currentTime>=s.loopOut){
      audio.currentTime=s.loopIn;
    }
    patch(d,{time:audio.currentTime,duration:audio.duration||0});
  };

  const jog=(d:DeckId)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    let prev=e.clientX;
    const move=(ev:PointerEvent)=>{
      const dx=ev.clientX-prev; prev=ev.clientX;
      const audio=el(d);
      if(audio && Number.isFinite(audio.duration)){
        audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+dx*.035));
      }
      if(d==='A') setJogA(v=>v+dx*1.1);
      else setJogB(v=>v+dx*1.1);
    };
    const up=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const knobDrag=(id:string)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startY=e.clientY, start=knob[id]||0;
    const move=(ev:PointerEvent)=>{
      const next=Math.max(-135,Math.min(135,start+(startY-ev.clientY)*1.15));
      setKnob(v=>({...v,[id]:next}));
      if(id==='master') setMaster((next+135)/270);
    };
    const up=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const Hot=({id,x,y,w,h,onClick,title,round=false}:{id:string,x:number,y:number,w:number,h:number,onClick:()=>void,title:string,round?:boolean})=>(
    <button
      className={`${styles.hot} ${round?styles.round:''} ${pressed[id]?styles.pressed:''}`}
      style={{left:`${x}%`,top:`${y}%`,width:`${w}%`,height:`${h}%`}}
      onClick={onClick}
      title={title}
      aria-label={title}
    />
  );

  const Knob=({id,x,y,s=3.9}:{id:string,x:number,y:number,s?:number})=>(
    <div
      className={styles.knob}
      onPointerDown={knobDrag(id)}
      style={{left:`${x}%`,top:`${y}%`,width:`${s}%`,transform:`translate(-50%,-50%) rotate(${knob[id]||0}deg)`}}
      title={`${id} — drag up/down`}
    >
      <i />
    </div>
  );

  return <main className={styles.page}>
    <audio ref={aRef} src={A.url} onTimeUpdate={()=>timeUpdate('A')} onEnded={()=>patch('A',{playing:false})}/>
    <audio ref={bRef} src={B.url} onTimeUpdate={()=>timeUpdate('B')} onEnded={()=>patch('B',{playing:false})}/>

    <header className={styles.waveTop}>
      <div className={styles.deckMeta}>
        <strong>{A.name}</strong>
        <span>{A.artist}</span>
        <div><b>{A.bpm}</b> BPM <em>{fmt(A.time)} / {fmt(A.duration)}</em></div>
        <div className={styles.waveMini}/>
      </div>

      <div className={styles.waveCenter}>
        <div className={styles.playhead}/>
        <div className={styles.waveRow}/>
        <div className={`${styles.waveRow} ${styles.waveRow2}`}/>
      </div>

      <div className={`${styles.deckMeta} ${styles.right}`}>
        <strong>{B.name}</strong>
        <span>{B.artist}</span>
        <div><b>{B.bpm}</b> BPM <em>{fmt(B.time)} / {fmt(B.duration)}</em></div>
        <div className={styles.waveMini}/>
      </div>
    </header>

    <div className={styles.studioBar}>
      <button onClick={()=>history.back()}>← Learning Dojo</button>
      <b>STUDIO</b>
      <span>HER9AL Web DJ</span>
    </div>

    <section className={styles.stage}>
      <div className={styles.controller}>
        <img src="/ddj-flx4-reference.png" className={styles.controllerImg} alt="DDJ-FLX4"/>

        <div className={`${styles.jog} ${A.playing?styles.spin:''}`} style={{left:'7.1%',top:'17.2%',transform:`rotate(${jogA}deg)`}} onPointerDown={jog('A')}><i/></div>
        <div className={`${styles.jog} ${B.playing?styles.spin:''}`} style={{left:'67.5%',top:'17.2%',transform:`rotate(${jogB}deg)`}} onPointerDown={jog('B')}><i/></div>

        <Knob id="trimA" x={46.3} y={16.0}/>
        <Knob id="trimB" x={53.9} y={16.0}/>
        <Knob id="hiA" x={46.3} y={24.0}/>
        <Knob id="hiB" x={53.9} y={24.0}/>
        <Knob id="midA" x={46.3} y={32.1}/>
        <Knob id="midB" x={53.9} y={32.1}/>
        <Knob id="lowA" x={46.3} y={40.4}/>
        <Knob id="lowB" x={53.9} y={40.4}/>
        <Knob id="filterA" x={46.3} y={49.1}/>
        <Knob id="filterB" x={53.9} y={49.1}/>
        <Knob id="master" x={61.9} y={16.1} s={4.2}/>
        <Knob id="fx" x={61.8} y={61.0} s={4.2}/>

        <Hot id="playA" x={1.3} y={79.7} w={6.1} h={9.6} onClick={play('A')} title="Play/Pause A" round/>
        <Hot id="cueA" x={1.3} y={68.6} w={6.1} h={9.4} onClick={()=>cue('A')} title="Cue A" round/>
        <Hot id="playB" x={68.0} y={79.7} w={6.1} h={9.6} onClick={play('B')} title="Play/Pause B" round/>
        <Hot id="cueB" x={68.0} y={68.6} w={6.1} h={9.4} onClick={()=>cue('B')} title="Cue B" round/>

        <Hot id="syncA" x={12.0} y={4.5} w={4.6} h={5.4} onClick={()=>sync('A')} title="Beat Sync A" round/>
        <Hot id="syncB" x={79.4} y={4.5} w={4.6} h={5.4} onClick={()=>sync('B')} title="Beat Sync B" round/>
        <Hot id="loopA" x={20.9} y={4.5} w={7.4} h={5.3} onClick={()=>loop4('A')} title="4 Beat Loop A"/>
        <Hot id="loopB" x={87.2} y={4.5} w={7.4} h={5.3} onClick={()=>loop4('B')} title="4 Beat Loop B"/>

        <Hot id="loadA" x={42.0} y={1.9} w={4.8} h={5.5} onClick={()=>setLibrary(true)} title="Load A"/>
        <Hot id="loadB" x={55.0} y={1.9} w={4.8} h={5.5} onClick={()=>setLibrary(true)} title="Load B"/>

        {Array.from({length:8}).map((_,i)=><Hot key={'A'+i} id={'padA'+i}
          x={8.4+(i%4)*4.8} y={72.0+Math.floor(i/4)*8.2} w={4.3} h={6.3}
          onClick={()=>flash('padA'+i,220)} title={`Pad A ${i+1}`}/>)}

        {Array.from({length:8}).map((_,i)=><Hot key={'B'+i} id={'padB'+i}
          x={75.0+(i%4)*4.8} y={72.0+Math.floor(i/4)*8.2} w={4.3} h={6.3}
          onClick={()=>flash('padB'+i,220)} title={`Pad B ${i+1}`}/>)}

        <input className={`${styles.vSlider} ${styles.tempoA}`} type="range" min=".84" max="1.16" step=".001" value={A.rate} onChange={e=>patch('A',{rate:Number(e.target.value)})}/>
        <input className={`${styles.vSlider} ${styles.tempoB}`} type="range" min=".84" max="1.16" step=".001" value={B.rate} onChange={e=>patch('B',{rate:Number(e.target.value)})}/>
        <input className={`${styles.vSlider} ${styles.chA}`} type="range" min="0" max="1" step=".01" value={A.channel} onChange={e=>patch('A',{channel:Number(e.target.value)})}/>
        <input className={`${styles.vSlider} ${styles.chB}`} type="range" min="0" max="1" step=".01" value={B.channel} onChange={e=>patch('B',{channel:Number(e.target.value)})}/>

        <input className={styles.cross} type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/>

        <button className={styles.cueStoreA} onDoubleClick={()=>setCue('A')} aria-label="Set cue A"/>
        <button className={styles.cueStoreB} onDoubleClick={()=>setCue('B')} aria-label="Set cue B"/>
      </div>
    </section>

    <div className={styles.flag}>⚑</div>
    <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

    <nav className={styles.dock}>
      <button onClick={()=>setLibrary(v=>!v)}>♫ Music Library</button>
      <button>♬ DDJ-FLX4</button>
      <button onClick={()=>setSettings(v=>!v)}>⚙ Settings</button>
    </nav>

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
      <p>Jog wheels: drag horizontally. Knobs: drag up/down. Double-click CUE to store a cue point.</p>
    </aside>}
  </main>;
}
