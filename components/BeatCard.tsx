'use client';
import { Play, ShoppingBag } from 'lucide-react';

export type Beat = { id:string; title:string; bpm:number; keyName:string; mood:string; price:number; cover?:string };

export default function BeatCard({beat}:{beat:Beat}){
  return <article className="beat-card">
    <div className="cover" style={{backgroundImage:`url(${beat.cover || '/her9al-logo.jpg'})`}}>
      <button className="play"><Play size={18} fill="currentColor" /></button>
    </div>
    <div className="beat-meta">
      <div><h3>{beat.title}</h3><p>{beat.bpm} BPM · {beat.keyName} · {beat.mood}</p></div>
      <button className="buy"><ShoppingBag size={16}/> ${beat.price}</button>
    </div>
  </article>
}
