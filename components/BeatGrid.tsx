'use client';
import { useEffect,useMemo,useState } from 'react';
import BeatCard,{Beat} from '@/components/BeatCard';
import { AudioLines,Disc3,Headphones,Music2,Search,X } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';
import { GENRES,STYLES } from '@/lib/catalog';
import { catalogMessage } from '@/lib/catalog-state';

export default function BeatGrid({compact=false}:{compact?:boolean}){
  const[beats,setBeats]=useState<Beat[]>([]);const[query,setQuery]=useState('');const[genre,setGenre]=useState('All');const[style,setStyle]=useState('All');const[mode,setMode]=useState<'tracks'|'collections'>('tracks');
  const[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const{playBeat}=usePlayer();
  useEffect(()=>{
    let active=true;
    fetch('/api/beats',{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error('catalog_failed');
      const j=await r.json();
      if(!Array.isArray(j.beats))throw new Error('catalog_invalid');
      return j.beats as Beat[];
    }).then(j=>{
      if(!active)return;
      setBeats(j);setStatus('ready');
    }).catch(e=>{
      if(!active)return;
      console.error('HER9AL BEAT GRID ERROR:',e);
      setBeats([]);setStatus('error');
    });
    return()=>{active=false};
  },[]);
  const filtered=useMemo(()=>beats.filter(b=>{const q=query.toLowerCase().trim();const matchesQ=!q||[b.title,b.mood,b.genre,b.style,b.albums?.title,b.description].some(v=>String(v||'').toLowerCase().includes(q));const matchesMode=mode==='tracks'||!!b.albums;return matchesQ&&matchesMode&&(genre==='All'||b.genre===genre)&&(style==='All'||b.style===style)}),[beats,query,genre,style,mode]);
  const reset=()=>{setQuery('');setGenre('All');setStyle('All');setMode('tracks')};
  const message=status==='error'?catalogMessage(true,0,0):status==='ready'?catalogMessage(false,beats.length,filtered.length):null;
  return <>
    {!compact&&<>
      <div className="browse-mega">
        <div className="browse-tabs">
          <button className={mode==='tracks'?'active':''} onClick={()=>setMode('tracks')}><Music2 size={16}/> Tracks</button>
          <button className={mode==='collections'?'active':''} onClick={()=>setMode('collections')}><Disc3 size={16}/> Collections</button>
          <button disabled title="Coming soon"><AudioLines size={16}/> Sound Kits <em>SOON</em></button>
          <button disabled title="Coming soon"><Headphones size={16}/> Musicians <em>SOON</em></button>
        </div>
        <div className="browse-columns">
          <div><h3>BROWSE</h3><button onClick={reset}>All Beats</button><button onClick={()=>{setMode('tracks');setQuery('new')}}>New & Notable</button><button onClick={()=>{setMode('collections')}}>Albums / Tapes</button><button onClick={()=>{setGenre('Trap');setStyle('All')}}>Trap Picks</button><button onClick={()=>{setGenre('Drill');setStyle('All')}}>Drill Picks</button></div>
          <div><h3>GENRES</h3>{GENRES.slice(0,12).map(x=><button className={genre===x?'selected':''} key={x} onClick={()=>{setMode('tracks');setGenre(x)}}>{x}</button>)}</div>
          <div><h3>BEAT STYLES</h3>{STYLES.slice(0,14).map(x=><button className={style===x?'selected':''} key={x} onClick={()=>{setMode('tracks');setStyle(x)}}>{x}</button>)}</div>
        </div>
      </div>
      <div className="catalog-search"><Search size={18}/><input placeholder="Search beats, styles, moods, albums…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')}><X size={16}/></button>}</div>
      <div className="catalog-filter-row"><select value={genre} onChange={e=>setGenre(e.target.value)}><option>All</option>{GENRES.map(x=><option key={x}>{x}</option>)}</select><select value={style} onChange={e=>setStyle(e.target.value)}><option>All</option>{STYLES.map(x=><option key={x}>{x}</option>)}</select><span>{filtered.length} track{filtered.length===1?'':'s'}{mode==='collections'?' in collections':''}</span></div>
    </>}
    <div className="grid">{filtered.slice(0,compact?6:99).map(b=><BeatCard key={b.id} beat={b} onPlay={playBeat}/>)}{message&&<div className="empty-state" role={status==='error'?'alert':undefined}>{message}</div>}</div>
  </>;
}
