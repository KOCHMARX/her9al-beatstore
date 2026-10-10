'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Home, Library, Pause, Play, Search, Settings, Upload, X } from 'lucide-react';

type Track = {
  id:string;
  title:string;
  artist?:string|null;
  audio_url?:string|null;
  cover_url?:string|null;
  bpm?:number|null;
  meta?:string|null;
};

type Deck = {
  track:Track|null;
  playing:boolean;
  current:number;
  duration:number;
  bpm:number;
  tempo:number;
  cue:number;
  loopIn:number|null;
  loopOut:number|null;
  looping:boolean;
  hot:number[];
  hi:number;
  mid:number;
  low:number;
  filter:number;
  trim:number;
};

const emptyDeck=():Deck=>({
  track:null,playing:false,current:0,duration:0,bpm:120,tempo:0,cue:0,
  loopIn:null,loopOut:null,looping:false,hot:Array(8).fill(-1),
  hi:0,mid:0,low:0,filter:0,trim:0,
});

function fmt(v:number){
  if(!Number.isFinite(v)||v<0)return '0:00';
  const m=Math.floor(v/60),s=Math.floor(v%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function Wave({deck,onSeek,compact=false}:{deck:Deck;onSeek:(r:number)=>void;compact?:boolean}){
  const [peaks,setPeaks]=useState<number[]>(Array(compact?90:160).fill(.2));
  useEffect(()=>{
    let dead=false; const src=deck.track?.audio_url;
    if(!src){setPeaks(Array(compact?90:160).fill(.2));return;}
    (async()=>{
      try{
        const res=await fetch(src,{cache:'force-cache'}); const arr=await res.arrayBuffer();
        const AC=window.AudioContext||(window as any).webkitAudioContext; const ctx=new AC();
        const decoded=await ctx.decodeAudioData(arr.slice(0)); const data=decoded.getChannelData(0);
        const bars=compact?90:160,step=Math.max(1,Math.floor(data.length/bars)),out:number[]=[];
        for(let i=0;i<bars;i++){
          const a=i*step,b=Math.min(data.length,a+step); let max=0;
          for(let j=a;j<b;j+=Math.max(1,Math.floor(step/90)))max=Math.max(max,Math.abs(data[j]));
          out.push(Math.max(.08,Math.min(1,max*2.6)));
        }
        if(!dead)setPeaks(out); await ctx.close();
      }catch{}
    })();
    return()=>{dead=true};
  },[deck.track?.audio_url,compact]);
  const progress=deck.duration?deck.current/deck.duration:0;
  return <button className={`dj104-wave ${compact?'compact':''}`} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();onSeek((e.clientX-r.left)/r.width)}}>
    <div className="dj104-wavebars">{peaks.map((p,i)=><i key={i} className={i/peaks.length<=progress?'played':''} style={{height:`${Math.max(8,p*100)}%`}}/>)}</div>
    <span className="dj104-playhead" style={{left:`${Math.max(0,Math.min(100,progress*100))}%`}}/>
  </button>;
}

export default function DJStudio(){
  const [ready,setReady]=useState(false);
  const [library,setLibrary]=useState<Track[]>([]);
  const [query,setQuery]=useState('');
  const [drawer,setDrawer]=useState<'library'|'settings'|null>(null);
  const [a,setA]=useState<Deck>(emptyDeck());
  const [b,setB]=useState<Deck>(emptyDeck());
  const [cross,setCross]=useState(0);
  const [volA,setVolA]=useState(.94),[volB,setVolB]=useState(.94),[master,setMaster]=useState(.92);
  const audioA=useRef<HTMLAudioElement>(null),audioB=useRef<HTMLAudioElement>(null);
  const dragRef=useRef<{side:'A'|'B';x:number;t:number}|null>(null);

  useEffect(()=>{
    fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json()).then(j=>{
      if(!j.user){location.href='/login?next=/dj';return;} setReady(true);
    }).catch(()=>location.href='/login?next=/dj');
    fetch('/api/dj/library',{cache:'no-store'}).then(async r=>{if(r.ok)setLibrary((await r.json()).tracks||[])}).catch(()=>{});
  },[]);

  const bind=(el:HTMLAudioElement|null,setter:React.Dispatch<React.SetStateAction<Deck>>)=>{
    if(!el)return;
    const sync=()=>setter(x=>({...x,current:el.currentTime||0,duration:Number.isFinite(el.duration)?el.duration:x.duration,playing:!el.paused}));
    el.ontimeupdate=sync;el.onloadedmetadata=sync;el.ondurationchange=sync;el.onplay=sync;el.onpause=sync;el.onended=sync;
  };
  useEffect(()=>{bind(audioA.current,setA);bind(audioB.current,setB)},[]);

  useEffect(()=>{
    const ga=(1-Math.max(0,cross))*volA*master*Math.pow(10,a.trim/20);
    const gb=(1+Math.min(0,cross))*volB*master*Math.pow(10,b.trim/20);
    if(audioA.current){audioA.current.playbackRate=Math.max(.65,Math.min(1.35,1+a.tempo/100));audioA.current.volume=Math.max(0,Math.min(1,ga));}
    if(audioB.current){audioB.current.playbackRate=Math.max(.65,Math.min(1.35,1+b.tempo/100));audioB.current.volume=Math.max(0,Math.min(1,gb));}
  },[a.tempo,b.tempo,a.trim,b.trim,volA,volB,master,cross]);

  useEffect(()=>{
    const id=setInterval(()=>{
      const loop=(el:HTMLAudioElement|null,d:Deck)=>{if(el&&d.looping&&d.loopIn!==null&&d.loopOut!==null&&el.currentTime>=d.loopOut)el.currentTime=d.loopIn};
      loop(audioA.current,a);loop(audioB.current,b);
    },35);return()=>clearInterval(id);
  },[a.looping,a.loopIn,a.loopOut,b.looping,b.loopIn,b.loopOut]);

  const get=(s:'A'|'B')=>s==='A'?{d:a,set:setA,el:audioA.current}:{d:b,set:setB,el:audioB.current};
  const load=(side:'A'|'B',track:Track)=>{
    const {set,el}=get(side); if(!el||!track.audio_url)return;
    el.pause();el.src=track.audio_url;el.load();set(x=>({...emptyDeck(),track,bpm:Number(track.bpm)||x.bpm}));
  };
  const local=(side:'A'|'B',file:File)=>load(side,{id:`local-${Date.now()}`,title:file.name.replace(/\.[^.]+$/,''),artist:'Local file',audio_url:URL.createObjectURL(file)});
  const toggle=(s:'A'|'B')=>{const {el}=get(s);if(!el?.src)return;el.paused?el.play().catch(()=>{}):el.pause()};
  const cue=(s:'A'|'B')=>{const {d,el}=get(s);if(!el)return;el.currentTime=d.cue;el.pause()};
  const setCue=(s:'A'|'B')=>{const {d,set}=get(s);set(x=>({...x,cue:d.current}))};
  const seek=(s:'A'|'B',ratio:number)=>{const {el}=get(s);if(el&&Number.isFinite(el.duration))el.currentTime=Math.max(0,Math.min(el.duration,el.duration*ratio))};
  const sync=(s:'A'|'B')=>{
    if(s==='A'){const target=b.bpm*(1+b.tempo/100);setA(x=>({...x,tempo:Math.max(-16,Math.min(16,((target/x.bpm)-1)*100))}))}
    else{const target=a.bpm*(1+a.tempo/100);setB(x=>({...x,tempo:Math.max(-16,Math.min(16,((target/x.bpm)-1)*100))}))}
  };
  const loop4=(s:'A'|'B')=>{const {d,set}=get(s);const len=(60/(d.bpm||120))*4;set(x=>({...x,loopIn:d.current,loopOut:d.current+len,looping:true}))};
  const loopIn=(s:'A'|'B')=>{const {d,set}=get(s);set(x=>({...x,loopIn:d.current}))};
  const loopOut=(s:'A'|'B')=>{const {d,set}=get(s);set(x=>({...x,loopOut:d.current,looping:x.loopIn!==null&&d.current>(x.loopIn??0)}))};
  const jump=(s:'A'|'B',beats:number)=>{const {d,el}=get(s);if(!el)return;el.currentTime=Math.max(0,Math.min(el.duration||99999,el.currentTime+(60/(d.bpm||120))*beats))};
  const hot=(s:'A'|'B',idx:number)=>{const {d,set,el}=get(s);if(!el)return;const t=d.hot[idx];if(t>=0){el.currentTime=t;}else{const next=[...d.hot];next[idx]=d.current;set(x=>({...x,hot:next}))}};
  const jogDown=(side:'A'|'B',e:React.PointerEvent)=>{const {d}=get(side);dragRef.current={side,x:e.clientX,t:d.current};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)};
  const jogMove=(e:React.PointerEvent)=>{const drag=dragRef.current;if(!drag)return;const {el}=get(drag.side);if(!el)return;el.currentTime=Math.max(0,Math.min(el.duration||99999,drag.t+(e.clientX-drag.x)*.04))};
  const jogUp=()=>{dragRef.current=null};
  const filtered=useMemo(()=>library.filter(t=>`${t.title} ${t.artist||''} ${t.meta||''}`.toLowerCase().includes(query.toLowerCase())),[library,query]);

  if(!ready)return <div className="dj104-loading">Loading DJ Studio…</div>;

  return <section className="dj104-studio">
    <audio ref={audioA} crossOrigin="anonymous"/><audio ref={audioB} crossOrigin="anonymous"/>

    <header className="dj104-top">
      <div className="dj104-deckinfo left"><b>{a.track?.title||'Deck A'}</b><span>{a.track?.artist||'Load a track'}</span><div className="stats"><em>{Math.round(a.bpm*(1+a.tempo/100))} BPM</em><i>{fmt(a.current)}</i><i>-{fmt(a.duration-a.current)}</i></div><Wave compact deck={a} onSeek={r=>seek('A',r)}/></div>
      <div className="dj104-dualwave"><Wave deck={a} onSeek={r=>seek('A',r)}/><Wave deck={b} onSeek={r=>seek('B',r)}/><div className="beatmarks">{Array.from({length:13}).map((_,i)=><i key={i}/>)}</div></div>
      <div className="dj104-deckinfo right"><b>{b.track?.title||'Deck B'}</b><span>{b.track?.artist||'Load a track'}</span><div className="stats"><em>{Math.round(b.bpm*(1+b.tempo/100))} BPM</em><i>{fmt(b.current)}</i><i>-{fmt(b.duration-b.current)}</i></div><Wave compact deck={b} onSeek={r=>seek('B',r)}/></div>
    </header>

    <nav className="dj104-nav"><a href="/">← HER9AL</a><b>STUDIO</b><div><a href="/profile">Account</a><a href="/"><Home size={14}/></a></div></nav>

    <main className="dj104-stage">
      <div className="dj104-controller-wrap">
        <img src="/ddj-flx4-exact.png" className="dj104-controller" alt="DDJ-FLX4 controller"/>

        {/* JOG WHEELS */}
        <button className="hit jog jog-a" aria-label="Jog deck A" onPointerDown={e=>jogDown('A',e)} onPointerMove={jogMove} onPointerUp={jogUp}/>
        <button className="hit jog jog-b" aria-label="Jog deck B" onPointerDown={e=>jogDown('B',e)} onPointerMove={jogMove} onPointerUp={jogUp}/>

        {/* LOAD */}
        <label className="hit load load-a"><input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&local('A',e.target.files[0])}/><Upload/></label>
        <label className="hit load load-b"><input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&local('B',e.target.files[0])}/><Upload/></label>

        {/* LEFT TRANSPORT / LOOP */}
        <button className={`hit play play-a ${a.playing?'on':''}`} onClick={()=>toggle('A')}><span>{a.playing?'II':'▶'}</span></button>
        <button className="hit cue cue-a" onClick={()=>cue('A')} onDoubleClick={()=>setCue('A')}/>
        <button className="hit sync sync-a" onClick={()=>sync('A')}/>
        <button className="hit loop4 loop4-a" onClick={()=>loop4('A')}/>
        <button className="hit in in-a" onClick={()=>loopIn('A')}/><button className="hit out out-a" onClick={()=>loopOut('A')}/>
        <button className="hit callminus callminus-a" onClick={()=>jump('A',-4)}/><button className="hit callplus callplus-a" onClick={()=>jump('A',4)}/>

        {/* RIGHT TRANSPORT / LOOP */}
        <button className={`hit play play-b ${b.playing?'on':''}`} onClick={()=>toggle('B')}><span>{b.playing?'II':'▶'}</span></button>
        <button className="hit cue cue-b" onClick={()=>cue('B')} onDoubleClick={()=>setCue('B')}/>
        <button className="hit sync sync-b" onClick={()=>sync('B')}/>
        <button className="hit loop4 loop4-b" onClick={()=>loop4('B')}/>
        <button className="hit in in-b" onClick={()=>loopIn('B')}/><button className="hit out out-b" onClick={()=>loopOut('B')}/>
        <button className="hit callminus callminus-b" onClick={()=>jump('B',-4)}/><button className="hit callplus callplus-b" onClick={()=>jump('B',4)}/>

        {/* PERFORMANCE PADS */}
        {Array.from({length:8}).map((_,i)=><button key={`pa${i}`} className={`hit pad pad-a p${i+1} ${a.hot[i]>=0?'armed':''}`} onClick={()=>hot('A',i)}/>) }
        {Array.from({length:8}).map((_,i)=><button key={`pb${i}`} className={`hit pad pad-b p${i+1} ${b.hot[i]>=0?'armed':''}`} onClick={()=>hot('B',i)}/>) }

        {/* FADERS */}
        <input aria-label="Tempo A" className="ctl tempo tempo-a" type="range" min="-16" max="16" step=".1" value={a.tempo} onChange={e=>setA(x=>({...x,tempo:Number(e.target.value)}))}/>
        <input aria-label="Tempo B" className="ctl tempo tempo-b" type="range" min="-16" max="16" step=".1" value={b.tempo} onChange={e=>setB(x=>({...x,tempo:Number(e.target.value)}))}/>
        <input aria-label="Channel A" className="ctl channel channel-a" type="range" min="0" max="1" step=".01" value={volA} onChange={e=>setVolA(Number(e.target.value))}/>
        <input aria-label="Channel B" className="ctl channel channel-b" type="range" min="0" max="1" step=".01" value={volB} onChange={e=>setVolB(Number(e.target.value))}/>
        <input aria-label="Crossfader" className="ctl cross" type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/>
        <input aria-label="Master level" className="ctl master" type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/>

        {/* MIXER KNOB HIT AREAS - web values */}
        <input className="knob trim-a" title="Trim A" type="range" min="-12" max="9" step=".5" value={a.trim} onChange={e=>setA(x=>({...x,trim:Number(e.target.value)}))}/>
        <input className="knob trim-b" title="Trim B" type="range" min="-12" max="9" step=".5" value={b.trim} onChange={e=>setB(x=>({...x,trim:Number(e.target.value)}))}/>
        <input className="knob hi-a" title="High A" type="range" min="-26" max="6" step="1" value={a.hi} onChange={e=>setA(x=>({...x,hi:Number(e.target.value)}))}/>
        <input className="knob hi-b" title="High B" type="range" min="-26" max="6" step="1" value={b.hi} onChange={e=>setB(x=>({...x,hi:Number(e.target.value)}))}/>
        <input className="knob mid-a" title="Mid A" type="range" min="-26" max="6" step="1" value={a.mid} onChange={e=>setA(x=>({...x,mid:Number(e.target.value)}))}/>
        <input className="knob mid-b" title="Mid B" type="range" min="-26" max="6" step="1" value={b.mid} onChange={e=>setB(x=>({...x,mid:Number(e.target.value)}))}/>
        <input className="knob low-a" title="Low A" type="range" min="-26" max="6" step="1" value={a.low} onChange={e=>setA(x=>({...x,low:Number(e.target.value)}))}/>
        <input className="knob low-b" title="Low B" type="range" min="-26" max="6" step="1" value={b.low} onChange={e=>setB(x=>({...x,low:Number(e.target.value)}))}/>
        <input className="knob cfx-a" title="Filter A" type="range" min="-1" max="1" step=".01" value={a.filter} onChange={e=>setA(x=>({...x,filter:Number(e.target.value)}))}/>
        <input className="knob cfx-b" title="Filter B" type="range" min="-1" max="1" step=".01" value={b.filter} onChange={e=>setB(x=>({...x,filter:Number(e.target.value)}))}/>
      </div>
    </main>

    <div className="dj104-dock"><button className={drawer==='library'?'active':''} onClick={()=>setDrawer(drawer==='library'?null:'library')}><Library size={14}/> Music Library</button><button className="device">⌘ DDJ-FLX4</button><button className={drawer==='settings'?'active':''} onClick={()=>setDrawer(drawer==='settings'?null:'settings')}><Settings size={14}/> Settings</button></div>
    <div className="dj104-brand">HER9AL <span>Web DJ</span></div>

    {drawer==='library'&&<aside className="dj104-drawer"><div className="drawer-head"><b>Music Library</b><button onClick={()=>setDrawer(null)}><X size={15}/></button></div><label className="libsearch"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tracks, artists, genres…"/></label><div className="librows">{filtered.map(t=><div className="librow" key={t.id}><img src={t.cover_url||'/her9al-logo.jpg'} alt=""/><div><b>{t.title}</b><span>{t.artist||'HER9AL'} {t.meta?`· ${t.meta}`:''}</span></div><button onClick={()=>load('A',t)}>LOAD A</button><button onClick={()=>load('B',t)}>LOAD B</button></div>)}{!filtered.length&&<p>No tracks found.</p>}</div></aside>}
    {drawer==='settings'&&<aside className="dj104-drawer settings"><div className="drawer-head"><b>Studio settings</b><button onClick={()=>setDrawer(null)}><X size={15}/></button></div><label>Master<input type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/></label><label>Crossfader<input type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/></label><p>Tip: drag either jog wheel left/right to scrub. Double-click CUE to save the cue. First tap on an empty pad stores a hot cue; later taps jump to it.</p></aside>}
  </section>;
}
