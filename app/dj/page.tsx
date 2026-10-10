'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dj.module.css';

type DeckId = 'A' | 'B';

type Track = {
  id?: string;
  title: string;
  artist?: string;
  url: string;
  bpm?: number;
};

type DeckState = {
  track: Track | null;
  playing: boolean;
  time: number;
  duration: number;
  cue: number;
  rate: number;
  volume: number;
  loopIn: number | null;
  loopOut: number | null;
};

const freshDeck = (): DeckState => ({
  track: null,
  playing: false,
  time: 0,
  duration: 0,
  cue: 0,
  rate: 1,
  volume: .9,
  loopIn: null,
  loopOut: null,
});

function fmt(sec:number){
  if(!Number.isFinite(sec)) return '00:00';
  const m=Math.floor(sec/60);
  const s=Math.floor(sec%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export default function DJStudio(){
  const audioA=useRef<HTMLAudioElement>(null);
  const audioB=useRef<HTMLAudioElement>(null);
  const [A,setA]=useState<DeckState>(freshDeck());
  const [B,setB]=useState<DeckState>(freshDeck());
  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(.92);
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [tracks,setTracks]=useState<Track[]>([]);
  const [jogA,setJogA]=useState(0);
  const [jogB,setJogB]=useState(0);
  const [blueA,setBlueA]=useState(false);
  const [blueB,setBlueB]=useState(false);
  const [knobs,setKnobs]=useState<Record<string,number>>({
    trimA:0,hiA:0,midA:0,lowA:0,filterA:0,
    trimB:0,hiB:0,midB:0,lowB:0,filterB:0,
  });
  const [lit,setLit]=useState<Record<string,boolean>>({});

  useEffect(()=>{
    fetch('/api/dj/tracks',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(j=>{
        const list=(j?.tracks||[]).map((t:any)=>({
          id:t.id,title:t.title,artist:t.artist||'HER9AL',url:t.audio_url||t.url,bpm:Number(t.bpm)||126
        })).filter((t:any)=>t.url);
        setTracks(list);
      }).catch(()=>{});
  },[]);

  const el=(d:DeckId)=>d==='A'?audioA.current:audioB.current;
  const state=(d:DeckId)=>d==='A'?A:B;
  const patch=(d:DeckId,p:Partial<DeckState>)=>d==='A'?setA(v=>({...v,...p})):setB(v=>({...v,...p}));

  const flash=(key:string,ms=180)=>{
    setLit(v=>({...v,[key]:true}));
    window.setTimeout(()=>setLit(v=>({...v,[key]:false})),ms);
  };

  const gains=useMemo(()=>{
    const ga=master*A.volume*(cross<=0?1:1-cross);
    const gb=master*B.volume*(cross>=0?1:1+cross);
    return {a:Math.max(0,Math.min(1,ga)),b:Math.max(0,Math.min(1,gb))};
  },[A.volume,B.volume,cross,master]);

  useEffect(()=>{ if(audioA.current) audioA.current.volume=gains.a; },[gains.a]);
  useEffect(()=>{ if(audioB.current) audioB.current.volume=gains.b; },[gains.b]);
  useEffect(()=>{ if(audioA.current) audioA.current.playbackRate=A.rate; },[A.rate]);
  useEffect(()=>{ if(audioB.current) audioB.current.playbackRate=B.rate; },[B.rate]);

  const load=(d:DeckId,track:Track)=>{
    patch(d,{track,playing:false,time:0,duration:0,cue:0,loopIn:null,loopOut:null,rate:1});
    setLibraryOpen(false);
    setTimeout(()=>el(d)?.load(),0);
  };

  const localLoad=(d:DeckId,file:File)=>{
    load(d,{title:file.name,artist:'Local file',url:URL.createObjectURL(file),bpm:126});
  };

  const playPause=async(d:DeckId)=>{
    const a=el(d); if(!a||!state(d).track) return;
    flash(`play${d}`,250);
    if(a.paused){ await a.play(); patch(d,{playing:true}); }
    else{ a.pause(); patch(d,{playing:false}); }
  };

  const cue=(d:DeckId)=>{
    const a=el(d); if(!a) return;
    a.pause(); a.currentTime=state(d).cue; patch(d,{playing:false});
    flash(`cue${d}`,250);
  };

  const setCue=(d:DeckId)=>{
    const a=el(d); if(!a) return;
    patch(d,{cue:a.currentTime}); flash(`cue${d}`,380);
  };

  const beatSync=(d:DeckId)=>{
    const other=d==='A'?B:A;
    const bpm=other.track?.bpm||126;
    patch(d,{rate:bpm/126});
    flash(`sync${d}`,300);
  };

  const loop4=(d:DeckId)=>{
    const a=el(d); if(!a) return;
    const bpm=state(d).track?.bpm||126;
    const len=4*60/bpm;
    patch(d,{loopIn:a.currentTime,loopOut:a.currentTime+len});
    flash(`loop${d}`,320);
  };

  const onTime=(d:DeckId)=>{
    const a=el(d); if(!a) return;
    const s=state(d);
    if(s.loopIn!==null&&s.loopOut!==null&&a.currentTime>=s.loopOut) a.currentTime=s.loopIn;
    patch(d,{time:a.currentTime,duration:a.duration||0});
  };

  const seek=(d:DeckId,delta:number)=>{
    const a=el(d); if(!a||!Number.isFinite(a.duration)) return;
    a.currentTime=Math.max(0,Math.min(a.duration,a.currentTime+delta));
  };

  const jogDrag=(d:DeckId)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    let lastX=e.clientX;
    d==='A'?setBlueA(true):setBlueB(true);
    const move=(ev:PointerEvent)=>{
      const dx=ev.clientX-lastX; lastX=ev.clientX;
      seek(d,dx*.04);
      d==='A'?setJogA(v=>v+dx*1.1):setJogB(v=>v+dx*1.1);
    };
    const up=()=>{
      d==='A'?setBlueA(false):setBlueB(false);
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const knobDrag=(id:string)=>(e:React.PointerEvent<HTMLDivElement>)=>{
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const y=e.clientY, start=knobs[id]||0;
    const move=(ev:PointerEvent)=>{
      const n=Math.max(-135,Math.min(135,start+(y-ev.clientY)*1.3));
      setKnobs(v=>({...v,[id]:n}));
    };
    const up=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',up);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };

  const filtered=tracks.filter(t=>(t.title+' '+(t.artist||'')).toLowerCase().includes(search.toLowerCase()));

  const Button=({id,x,y,w=4,h=4,onClick,title}:{id:string,x:number,y:number,w?:number,h?:number,onClick:()=>void,title:string})=>(
    <button
      className={`${styles.hitButton} ${lit[id]?styles.lit:''}`}
      style={{left:`${x}%`,top:`${y}%`,width:`${w}%`,height:`${h}%`}}
      onClick={onClick}
      title={title}
      aria-label={title}
    />
  );

  const Knob=({id,x,y,size=4}:{id:string,x:number,y:number,size?:number})=>(
    <div
      className={styles.knob}
      onPointerDown={knobDrag(id)}
      style={{
        left:`${x}%`,top:`${y}%`,width:`${size}%`,
        transform:`translate(-50%,-50%) rotate(${knobs[id]||0}deg)`
      }}
      title={`${id}: drag up/down`}
    >
      <img src="/ddj-knob.png" alt="" />
    </div>
  );

  return <main className={styles.page}>
    <audio ref={audioA} src={A.track?.url||''} onTimeUpdate={()=>onTime('A')} onEnded={()=>patch('A',{playing:false})}/>
    <audio ref={audioB} src={B.track?.url||''} onTimeUpdate={()=>onTime('B')} onEnded={()=>patch('B',{playing:false})}/>

    <header className={styles.waveHeader}>
      <div className={styles.trackCard}>
        <strong>{A.track?.title||'Deck A'}</strong>
        <span>{A.track?.artist||'No track loaded'}</span>
        <div><b>{A.track?.bpm||126}</b> BPM <em>{fmt(A.time)}</em></div>
        <div className={styles.miniWave}/>
      </div>
      <div className={styles.centerWave}>
        <div className={styles.playhead}/>
        <div className={styles.fullWave}/>
        <div className={`${styles.fullWave} ${styles.lower}`}/>
      </div>
      <div className={`${styles.trackCard} ${styles.right}`}>
        <strong>{B.track?.title||'Deck B'}</strong>
        <span>{B.track?.artist||'No track loaded'}</span>
        <div><b>{B.track?.bpm||126}</b> BPM <em>{fmt(B.time)}</em></div>
        <div className={styles.miniWave}/>
      </div>
    </header>

    <div className={styles.topbar}>
      <button onClick={()=>history.back()}>← Learning Dojo</button>
      <b>STUDIO</b>
      <span>HER9AL Web DJ</span>
    </div>

    <section className={styles.stage}>
      <div className={styles.controller}>
        <img className={styles.controllerBase} src="/ddj-flx4-reference.png" alt="DDJ-FLX4"/>

        <div className={`${styles.jog} ${blueA?styles.blue:''} ${A.playing?styles.spin:''}`}
          style={{left:'8.1%',top:'17.6%',transform:`rotate(${jogA}deg)`}}
          onPointerDown={jogDrag('A')}><img src="/ddj-jog-left.png" alt=""/></div>

        <div className={`${styles.jog} ${blueB?styles.blue:''} ${B.playing?styles.spin:''}`}
          style={{left:'67.3%',top:'17.6%',transform:`rotate(${jogB}deg)`}}
          onPointerDown={jogDrag('B')}><img src="/ddj-jog-right.png" alt=""/></div>

        <Knob id="trimA" x={46.1} y={16.5}/>
        <Knob id="trimB" x={54.2} y={16.5}/>
        <Knob id="hiA" x={46.1} y={24.3}/>
        <Knob id="hiB" x={54.2} y={24.3}/>
        <Knob id="midA" x={46.1} y={32.1}/>
        <Knob id="midB" x={54.2} y={32.1}/>
        <Knob id="lowA" x={46.1} y={40.2}/>
        <Knob id="lowB" x={54.2} y={40.2}/>
        <Knob id="filterA" x={46.1} y={49.2}/>
        <Knob id="filterB" x={54.2} y={49.2}/>

        <Button id="playA" x={1.2} y={79.0} w={6.0} h={10.0} onClick={()=>playPause('A')} title="Play/Pause A"/>
        <Button id="cueA" x={1.2} y={67.5} w={6.0} h={9.0} onClick={()=>cue('A')} title="Cue A"/>
        <Button id="playB" x={68.0} y={79.0} w={6.0} h={10.0} onClick={()=>playPause('B')} title="Play/Pause B"/>
        <Button id="cueB" x={68.0} y={67.5} w={6.0} h={9.0} onClick={()=>cue('B')} title="Cue B"/>

        <Button id="syncA" x={11.7} y={4.0} w={4.4} h={5.3} onClick={()=>beatSync('A')} title="Beat Sync A"/>
        <Button id="loopA" x={20.5} y={4.0} w={7.5} h={5.3} onClick={()=>loop4('A')} title="4 Beat Loop A"/>
        <Button id="syncB" x={79.4} y={4.0} w={4.4} h={5.3} onClick={()=>beatSync('B')} title="Beat Sync B"/>
        <Button id="loopB" x={87.0} y={4.0} w={7.6} h={5.3} onClick={()=>loop4('B')} title="4 Beat Loop B"/>

        <Button id="loadA" x={42.0} y={2.0} w={4.5} h={5} onClick={()=>setLibraryOpen(true)} title="Load A"/>
        <Button id="loadB" x={55.4} y={2.0} w={4.5} h={5} onClick={()=>setLibraryOpen(true)} title="Load B"/>

        {Array.from({length:8}).map((_,i)=><Button key={'pa'+i} id={'pa'+i}
          x={8.7+(i%4)*4.7} y={72.1+Math.floor(i/4)*8.1} w={4.1} h={6.5}
          onClick={()=>flash('pa'+i,220)} title={`Pad A ${i+1}`}/>)}

        {Array.from({length:8}).map((_,i)=><Button key={'pb'+i} id={'pb'+i}
          x={75.1+(i%4)*4.7} y={72.1+Math.floor(i/4)*8.1} w={4.1} h={6.5}
          onClick={()=>flash('pb'+i,220)} title={`Pad B ${i+1}`}/>)}

        <input className={`${styles.vslider} ${styles.tempoA}`} type="range" min=".84" max="1.16" step=".001"
          value={A.rate} onChange={e=>patch('A',{rate:Number(e.target.value)})}/>
        <input className={`${styles.vslider} ${styles.tempoB}`} type="range" min=".84" max="1.16" step=".001"
          value={B.rate} onChange={e=>patch('B',{rate:Number(e.target.value)})}/>
        <input className={`${styles.vslider} ${styles.channelA}`} type="range" min="0" max="1" step=".01"
          value={A.volume} onChange={e=>patch('A',{volume:Number(e.target.value)})}/>
        <input className={`${styles.vslider} ${styles.channelB}`} type="range" min="0" max="1" step=".01"
          value={B.volume} onChange={e=>patch('B',{volume:Number(e.target.value)})}/>
        <input className={styles.cross} type="range" min="-1" max="1" step=".01"
          value={cross} onChange={e=>setCross(Number(e.target.value))}/>

        <button className={styles.cueStoreA} onDoubleClick={()=>setCue('A')} aria-label="Store cue A"/>
        <button className={styles.cueStoreB} onDoubleClick={()=>setCue('B')} aria-label="Store cue B"/>
      </div>
    </section>

    <div className={styles.flag}>⚑</div>
    <div className={styles.brand}>HER9AL <small>Web DJ</small></div>

    <nav className={styles.dock}>
      <button onClick={()=>setLibraryOpen(v=>!v)}>♫ Music Library</button>
      <button>♬ DDJ-FLX4</button>
      <button onClick={()=>setSettingsOpen(v=>!v)}>⚙ Settings</button>
    </nav>

    {libraryOpen&&<aside className={styles.drawer}>
      <div className={styles.drawerHead}>
        <div><small>HER9AL</small><h2>Music Library</h2></div>
        <button onClick={()=>setLibraryOpen(false)}>×</button>
      </div>
      <input className={styles.search} placeholder="Search tracks..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className={styles.localRow}>
        <label>Load local to A<input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&localLoad('A',e.target.files[0])}/></label>
        <label>Load local to B<input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&localLoad('B',e.target.files[0])}/></label>
      </div>
      <div className={styles.trackList}>
        {filtered.map((t,i)=><div className={styles.track} key={t.id||i}>
          <div><b>{t.title}</b><span>{t.artist||'HER9AL'} · {t.bpm||126} BPM</span></div>
          <button onClick={()=>load('A',t)}>LOAD A</button>
          <button onClick={()=>load('B',t)}>LOAD B</button>
        </div>)}
        {!filtered.length&&<p>No DJ tracks yet. Use a local file or publish tracks from the DJ admin.</p>}
      </div>
    </aside>}

    {settingsOpen&&<aside className={`${styles.drawer} ${styles.settings}`}>
      <div className={styles.drawerHead}>
        <div><small>HER9AL</small><h2>Settings</h2></div>
        <button onClick={()=>setSettingsOpen(false)}>×</button>
      </div>
      <label>Master level <input type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/></label>
      <p>Jog wheels: drag left/right. Mixer knobs: drag up/down. Double-click CUE to store a cue point.</p>
    </aside>}
  </main>
}
