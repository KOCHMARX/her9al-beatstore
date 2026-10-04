'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Library, LogOut, Settings, Shield } from 'lucide-react';

type Me = {id:string;display_name?:string|null;email?:string|null;avatar_url?:string|null;role?:string}|null;

export default function SiteHeader(){
  const [user,setUser]=useState<Me>(null); const [open,setOpen]=useState(false); const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json()).then(x=>setUser(x.user||null)).catch(()=>{});},[]);
  useEffect(()=>{const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[]);
  return <nav className="nav"><Link href="/" className="brand"><img src="/her9al-logo.jpg" alt="HER9AL"/><span>HER9AL</span></Link><div className="navlinks"><Link href="/beats">Beats</Link><Link href="/#artist">Artist</Link>{user?<div className="profile-menu" ref={ref}><button className="profile-trigger" onClick={()=>setOpen(!open)}><img src={user.avatar_url||'/her9al-logo.jpg'} alt="profile"/><span>{user.display_name||user.email||'Profile'}</span><ChevronDown size={15}/></button>{open&&<div className="profile-dropdown"><Link href="/profile"><Settings size={15}/> Profile</Link><Link href="/library"><Library size={15}/> My beats</Link>{['owner','admin','editor'].includes(user.role||'')&&<Link href="/admin"><Shield size={15}/> Admin</Link>}<a href="/api/auth/logout"><LogOut size={15}/> Logout</a></div>}</div>:<Link className="login-pill" href="/login">Login</Link>}</div></nav>
}
