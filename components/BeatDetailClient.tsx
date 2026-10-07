'use client';

import Link from 'next/link';
import { Pause, Play, ShoppingBag, ShieldCheck, Download, Music2, Disc3 } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';
import AudioWaveform from '@/components/AudioWaveform';

function formatTime(value:number){if(!Number.isFinite(value)||value<0)return '0:00';const m=Math.floor(value/60);const s=Math.floor(value%60).toString().padStart(2,'0');return `${m}:${s}`}

export default function BeatDetailClient({ beat }: { beat: any }) {
  const { activeBeat, playing, currentTime, duration, playBeat, toggle, seek } = usePlayer();
  const licenses = (beat.licenses || []).filter((l:any)=>l.active!==false);
  const active = activeBeat?.id === beat.id;
  const progress = active && duration > 0 ? currentTime / duration : 0;
  const play = async()=>{if(active) await toggle(); else await playBeat(beat)};

  return <section className="beat-detail-shell">
    <div className="beat-detail-cover-wrap"><div className="beat-detail-cover" style={{backgroundImage:`url(${beat.cover_url||'/her9al-logo.jpg'})`}}><button className="detail-play" onClick={play} disabled={!beat.preview_url}>{active&&playing?<Pause size={28} fill="currentColor"/>:<Play size={28} fill="currentColor"/>}</button></div></div>
    <div className="beat-detail-content">
      <span className="detail-kicker">HER9AL ORIGINAL</span><h1>{beat.title}</h1>
      <div className="detail-tags"><span>{beat.bpm||'—'} BPM</span><span>{beat.musical_key||'—'}</span>{beat.genre&&<span>{beat.genre}</span>}{beat.style&&<span>{beat.style}</span>}<span>{beat.mood||'HER9AL'}</span></div>
      {beat.albums?.title&&<div className="detail-album"><Disc3 size={16}/> From <b>{beat.albums.title}</b></div>}
      <p className="detail-copy">{beat.description||'Preview the beat, choose your license and keep every paid purchase inside your HER9AL account for future downloads.'}</p>
      <div className="detail-wave-wrap"><AudioWaveform src={beat.preview_url} progress={progress} bars={110} className="detail-wave-real" onSeekRatio={(ratio)=>{if(active&&duration>0)seek(duration*ratio);}}/><div className="detail-wave-time"><span>{active?formatTime(currentTime):'0:00'}</span><span>{active?formatTime(duration):'Preview'}</span></div></div>
      <div className="license-list">{licenses.map((lic:any)=><div className="license-card" key={lic.id}><div><div className="license-name"><ShieldCheck size={18}/> {lic.name}</div><p>{lic.file_format||'WAV + MP3'} · Secure delivery after payment</p></div><div className="license-action"><strong>${(lic.price_cents/100).toFixed(2)}</strong><Link href={`/checkout/${lic.id}`} className="primary detail-buy"><ShoppingBag size={17}/> Buy</Link></div></div>)}{!licenses.length&&<div className="empty-state">No active license is available for this beat yet.</div>}</div>
      <div className="detail-benefits"><span><Music2 size={16}/> Full beat details</span><span><Download size={16}/> Re-download from your library</span><span><ShieldCheck size={16}/> Private master delivery</span></div>
    </div>
  </section>;
}
