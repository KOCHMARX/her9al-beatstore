'use client';
import { Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useState } from 'react';

export default function AudioPlayer(){
  const [playing,setPlaying]=useState(false);
  return <div className="player">
    <img src="/her9al-logo.jpg" alt="HER9AL"/>
    <div className="player-info"><strong>HER9AL — Select a beat</strong><span>Preview player</span></div>
    <div className="controls"><SkipBack size={18}/><button onClick={()=>setPlaying(!playing)}>{playing?<Pause/>:<Play fill="currentColor"/>}</button><SkipForward size={18}/></div>
    <div className="wave"><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
    <Volume2 size={18}/>
  </div>
}
