'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

export default function AuthCallback(){
  const router = useRouter();
  const [message,setMessage] = useState('Signing you in…');

  useEffect(()=>{
    const run = async()=>{
      const code = new URLSearchParams(window.location.search).get('code');
      if(!code){ setMessage('Missing login code.'); return; }
      try{
        const supabase = getSupabase();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if(error) throw error;
        router.replace('/');
      }catch(e:any){
        setMessage(e?.message || 'Login failed.');
      }
    };
    run();
  },[router]);

  return <main className="auth-wrap"><div className="auth-card"><h1>{message}</h1><p>You can close this page if it does not redirect automatically.</p></div></main>;
}
