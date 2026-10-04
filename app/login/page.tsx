'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function Login(){
 const params = useSearchParams();
 const error = params.get('error');
 return <main className="auth-wrap"><div className="auth-card"><Link className="brand center" href="/"><img src="/her9al-logo.jpg"/><span>HER9AL</span></Link><h1>Welcome back.</h1><p>Login to access purchases, downloads and your library.</p>{error&&<p style={{color:'#ff304f',fontSize:13}}>Login failed: {error}</p>}<a href="/api/auth/google" className="oauth">Continue with Google</a><a href="/api/auth/discord" className="oauth">Continue with Discord</a><small>Direct secure login. Supabase remains your database & storage.</small></div></main>
}
