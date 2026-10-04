'use client';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

export default function Login(){
 const signIn=async(provider:'google'|'discord')=>{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
   const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
   if(!url||!key) return alert('Add Supabase keys in .env.local first.');
   const supabase=createBrowserClient(url,key);
   await supabase.auth.signInWithOAuth({provider,options:{redirectTo:`${location.origin}/auth/callback`}});
 };
 return <main className="auth-wrap"><div className="auth-card"><Link className="brand center" href="/"><img src="/her9al-logo.jpg"/><span>HER9AL</span></Link><h1>Welcome back.</h1><p>Login to access purchases, downloads and your library.</p><button onClick={()=>signIn('google')} className="oauth">Continue with Google</button><button onClick={()=>signIn('discord')} className="oauth">Continue with Discord</button><small>Secure authentication powered by Supabase.</small></div></main>
}
