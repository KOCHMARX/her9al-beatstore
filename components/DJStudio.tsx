'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Pause, Play, Search, Settings, SlidersHorizontal, Upload, Volume2, X } from 'lucide-react';

type Track = {
  id:string;
  title:string;
  artist?:string|null;
  audio_url?:string|null;
  cover_url?:string|null;
  bpm?:number|null;
};

type DeckState = {
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
};

const emptyDeck=():DeckState=>({track:null,playing:false,current:0,duration:0,bpm:120,tempo:0,cue:0,loopIn:null,loopOut:null,looping:false});

function fmt(v:number){
  if(!Number.isFinite(v)) return '0:00';
  const m=Math.floor(v/60), s=Math.floor(v%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function Wave({audio,deck,onSeek}:{audio:HTMLAudioElement|null;deck:DeckState;onSeek:(r:number)=>void}){
  const [peaks,setPeaks]=useState<number[]>(Array(110).fill(.22));
  useEffect(()=>{
    let dead=false;
    const src=deck.track?.audio_url;
    if(!src){setPeaks(Array(110).fill(.22));return;}
    (async()=>{
      try{
        const res=await fetch(src,{cache:'force-cache'}); const buf=await res.arrayBuffer();
        const Ctx=window.AudioContext||(window as any).webkitAudioContext; const ctx=new Ctx();
        const decoded=await ctx.decodeAudioData(buf.slice(0)); const data=decoded.getChannelData(0);
        const bars=110, step=Math.max(1,Math.floor(data.length/bars)); const next:number[]=[];
        for(let i=0;i<bars;i++){
          let max=0; const start=i*step, end=Math.min(data.length,start+step);
          for(let j=start;j<end;j+=Math.max(1,Math.floor(step/80))) max=Math.max(max,Math.abs(data[j]));
          next.push(Math.max(.08,Math.min(1,max*2.5)));
        }
        if(!dead)setPeaks(next); ctx.close().catch(()=>{});
      }catch{}
    })();
    return()=>{dead=true};
  },[deck.track?.audio_url]);
  const progress=deck.duration?deck.current/deck.duration:0;
  return <button className="tribe-wave" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();onSeek((e.clientX-r.left)/r.width)}}>
    <div className="tribe-wave-bars">{peaks.map((p,i)=><i key={i} className={i/peaks.length<=progress?'done':''} style={{height:`${Math.max(9,p*100)}%`}}/>)}</div>
    <span className="tribe-wave-cursor" style={{left:`${Math.max(0,Math.min(100,progress*100))}%`}}/>
  </button>
}

export default function DJStudio(){
  const [ready,setReady]=useState(false);
  const [library,setLibrary]=useState<Track[]>([]);
  const [query,setQuery]=useState('');
  const [drawer,setDrawer]=useState<'library'|'settings'|null>('library');
  const [a,setA]=useState<DeckState>(emptyDeck());
  const [b,setB]=useState<DeckState>(emptyDeck());
  const [cross,setCross]=useState(0);
  const [master,setMaster]=useState(.9);
  const [volA,setVolA]=useState(.95), [volB,setVolB]=useState(.95);
  const audioA=useRef<HTMLAudioElement>(null), audioB=useRef<HTMLAudioElement>(null);

  useEffect(()=>{
    fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json()).then(j=>{
      if(!j.user){location.href='/login?next=/dj';return;} setReady(true);
    }).catch(()=>location.href='/login?next=/dj');
    fetch('/api/dj/library',{cache:'no-store'}).then(async r=>{if(r.ok)setLibrary((await r.json()).tracks||[])}).catch(()=>{});
  },[]);

  const bind=(el:HTMLAudioElement|null,setter:React.Dispatch<React.SetStateAction<DeckState>>)=>{
    if(!el)return;
    const sync=()=>setter(x=>({...x,current:el.currentTime||0,duration:Number.isFinite(el.duration)?el.duration:x.duration,playing:!el.paused}));
    el.ontimeupdate=sync;el.onloadedmetadata=sync;el.ondurationchange=sync;el.onplay=sync;el.onpause=sync;el.onended=sync;
  };
  useEffect(()=>{bind(audioA.current,setA);bind(audioB.current,setB)},[]);

  useEffect(()=>{
    if(audioA.current){audioA.current.playbackRate=Math.max(.6,Math.min(1.4,1+a.tempo/100));audioA.current.volume=Math.max(0,Math.min(1,volA*master*(1-Math.max(0,cross))))}
    if(audioB.current){audioB.current.playbackRate=Math.max(.6,Math.min(1.4,1+b.tempo/100));audioB.current.volume=Math.max(0,Math.min(1,volB*master*(1+Math.min(0,cross))))}
  },[a.tempo,b.tempo,volA,volB,master,cross]);

  useEffect(()=>{
    const id=setInterval(()=>{
      const loop=(el:HTMLAudioElement|null,d:DeckState)=>{if(el&&d.looping&&d.loopIn!==null&&d.loopOut!==null&&el.currentTime>=d.loopOut)el.currentTime=d.loopIn};
      loop(audioA.current,a);loop(audioB.current,b);
    },40);return()=>clearInterval(id);
  },[a.looping,a.loopIn,a.loopOut,b.looping,b.loopIn,b.loopOut]);

  const load=(side:'A'|'B',track:Track)=>{
    const el=side==='A'?audioA.current:audioB.current; const set=side==='A'?setA:setB;
    if(!el||!track.audio_url)return;
    el.pause();el.src=track.audio_url;el.load();set(x=>({...x,track,bpm:Number(track.bpm)||x.bpm,current:0,duration:0,playing:false,cue:0,loopIn:null,loopOut:null,looping:false}));
  };
  const local=(side:'A'|'B',file:File)=>load(side,{id:`local-${Date.now()}`,title:file.name.replace(/\.[^.]+$/,''),artist:'Local file',audio_url:URL.createObjectURL(file)});
  const toggle=(side:'A'|'B')=>{const el=side==='A'?audioA.current:audioB.current;if(!el?.src)return;if(el.paused)el.play().catch(()=>{});else el.pause()};
  const cue=(side:'A'|'B')=>{const el=side==='A'?audioA.current:audioB.current;const d=side==='A'?a:b;if(!el)return;el.currentTime=d.cue;el.pause()};
  const setCue=(side:'A'|'B')=>{const d=side==='A'?a:b;(side==='A'?setA:setB)(x=>({...x,cue:d.current}))};
  const sync=(side:'A'|'B')=>{if(side==='A'){const target=b.bpm*(1+b.tempo/100);setA(x=>({...x,tempo:((target/x.bpm)-1)*100}))}else{const target=a.bpm*(1+a.tempo/100);setB(x=>({...x,tempo:((target/x.bpm)-1)*100}))}};
  const fourBeat=(side:'A'|'B')=>{const d=side==='A'?a:b;(side==='A'?setA:setB)(x=>({...x,loopIn:d.current,loopOut:d.current+(60/(d.bpm||120))*4,looping:true}))};
  const seek=(side:'A'|'B',ratio:number)=>{const el=side==='A'?audioA.current:audioB.current;if(el&&Number.isFinite(el.duration))el.currentTime=Math.max(0,Math.min(el.duration,el.duration*ratio))};
  const filtered=useMemo(()=>library.filter(t=>`${t.title} ${t.artist||''}`.toLowerCase().includes(query.toLowerCase())),[library,query]);

  if(!ready)return <div className="dj-loading">Loading DJ Studio…</div>;

  return <section className="tribe-studio">
    <audio ref={audioA} crossOrigin="anonymous"/><audio ref={audioB} crossOrigin="anonymous"/>

    <div className="tribe-topbar"><div className="tribe-brand">HER9AL <span>DJ STUDIO</span></div><div className="tribe-live">● LIVE MIX MODE</div></div>

    <div className="tribe-wave-row">
      <div className="tribe-wave-deck">
        <div className="tribe-track-meta"><b>{a.track?.title||'DECK A'}</b><span>{a.track?.artist||'Load a track'}</span><em>{fmt(a.current)} / {fmt(a.duration)}</em></div>
        <Wave audio={audioA.current} deck={a} onSeek={r=>seek('A',r)}/>
      </div>
      <div className="tribe-wave-deck">
        <div className="tribe-track-meta"><b>{b.track?.title||'DECK B'}</b><span>{b.track?.artist||'Load a track'}</span><em>{fmt(b.current)} / {fmt(b.duration)}</em></div>
        <Wave audio={audioB.current} deck={b} onSeek={r=>seek('B',r)}/>
      </div>
    </div>

    <div className="tribe-controller-wrap">
      <img className="tribe-controller" src="/ddj-flx4-reference.png" alt="DJ controller"/>
      <button className="tribe-hotspot hs-play-a" title="Play/Pause A" onClick={()=>toggle('A')}>{a.playing?<Pause/>:<Play/>}</button>
      <button className="tribe-hotspot hs-cue-a" title="Cue A" onClick={()=>cue('A')} onDoubleClick={()=>setCue('A')}>CUE</button>
      <button className="tribe-hotspot hs-sync-a" title="Beat Sync A" onClick={()=>sync('A')}>SYNC</button>
      <button className="tribe-hotspot hs-loop-a" title="4 Beat Loop A" onClick={()=>fourBeat('A')}>4</button>
      <label className="tribe-hotspot hs-load-a" title="Load local file to Deck A"><Upload/><input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&local('A',e.target.files[0])}/></label>

      <button className="tribe-hotspot hs-play-b" title="Play/Pause B" onClick={()=>toggle('B')}>{b.playing?<Pause/>:<Play/>}</button>
      <button className="tribe-hotspot hs-cue-b" title="Cue B" onClick={()=>cue('B')} onDoubleClick={()=>setCue('B')}>CUE</button>
      <button className="tribe-hotspot hs-sync-b" title="Beat Sync B" onClick={()=>sync('B')}>SYNC</button>
      <button className="tribe-hotspot hs-loop-b" title="4 Beat Loop B" onClick={()=>fourBeat('B')}>4</button>
      <label className="tribe-hotspot hs-load-b" title="Load local file to Deck B"><Upload/><input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&local('B',e.target.files[0])}/></label>

      <input className="tribe-overlay-slider s-tempo-a" title="Tempo A" type="range" min="-16" max="16" step=".1" value={a.tempo} onChange={e=>setA(x=>({...x,tempo:Number(e.target.value)}))}/>
      <input className="tribe-overlay-slider s-tempo-b" title="Tempo B" type="range" min="-16" max="16" step=".1" value={b.tempo} onChange={e=>setB(x=>({...x,tempo:Number(e.target.value)}))}/>
      <input className="tribe-overlay-slider s-ch-a" title="Channel A" type="range" min="0" max="1" step=".01" value={volA} onChange={e=>setVolA(Number(e.target.value))}/>
      <input className="tribe-overlay-slider s-ch-b" title="Channel B" type="range" min="0" max="1" step=".01" value={volB} onChange={e=>setVolB(Number(e.target.value))}/>
      <input className="tribe-overlay-slider s-cross" title="Crossfader" type="range" min="-1" max="1" step=".01" value={cross} onChange={e=>setCross(Number(e.target.value))}/>
      <input className="tribe-overlay-slider s-master" title="Master volume" type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/>
    </div>

    <div className="tribe-dock">
      <button className={drawer==='library'?'active':''} onClick={()=>setDrawer(drawer==='library'?null:'library')}><FolderOpen/>Music Library</button>
      <button className="deck-pill">DDJ-FLX4</button>
      <button className={drawer==='settings'?'active':''} onClick={()=>setDrawer(drawer==='settings'?null:'settings')}><Settings/>Settings</button>
      <div className="tribe-master-mini"><Volume2/><input type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/></div>
    </div>

    {drawer&&<div className="tribe-drawer">
      <div className="tribe-drawer-head"><b>{drawer==='library'?'Music Library':'Studio Settings'}</b><button onClick={()=>setDrawer(null)}><X/></button></div>
      {drawer==='library'?<>
        <label className="tribe-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search HER9AL tracks…"/></label>
        <div className="tribe-library-grid">{filtered.map(t=><div className="tribe-lib-row" key={t.id}><img src={t.cover_url||'/her9al-logo.jpg'}/><div><b>{t.title}</b><span>{t.artist||'HER9AL'} · {t.bpm||'—'} BPM</span></div><button onClick={()=>load('A',t)}>LOAD A</button><button onClick={()=>load('B',t)}>LOAD B</button></div>)}{!filtered.length&&<div className="tribe-empty">No tracks found.</div>}</div>
      </>:<div className="tribe-settings-grid">
        <label>Master<input type="range" min="0" max="1" step=".01" value={master} onChange={e=>setMaster(Number(e.target.value))}/></label>
        <label>Deck A volume<input type="range" min="0" max="1" step=".01" value={volA} onChange={e=>setVolA(Number(e.target.value))}/></label>
        <label>Deck B volume<input type="range" min="0" max="1" step=".01" value={volB} onChange={e=>setVolB(Number(e.target.value))}/></label>
        <div className="tribe-settings-note"><SlidersHorizontal/> Double-click CUE to set a cue point. Use LOAD hotspots or the library to load tracks.</div>
      </div>}
    </div>}
  </section>;
}
