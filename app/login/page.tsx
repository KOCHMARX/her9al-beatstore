'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    const messages: Record<string, string> = {
      google_not_configured: 'Google sign-in is not configured for this deployment yet. Please use email login or contact HER9AL.',
      discord_not_configured: 'Discord sign-in is not configured for this deployment yet. Please use email login or contact HER9AL.',
      google_origin: 'Google sign-in could not resolve a safe callback address for this deployment. Please contact HER9AL.',
      discord_origin: 'Discord sign-in could not resolve a safe callback address for this deployment. Please contact HER9AL.',
      google_state: 'That Google sign-in request expired or did not match. Please try again.',
      discord_state: 'That Discord sign-in request expired or did not match. Please try again.',
      google_denied: 'Google sign-in was cancelled. You can try again whenever you are ready.',
      discord_denied: 'Discord sign-in was cancelled. You can try again whenever you are ready.',
      google_token: 'Google could not complete the sign-in request. Please try again.',
      discord_token: 'Discord could not complete the sign-in request. Please try again.',
      google_profile: 'HER9AL could not read your Google profile. Please try again.',
      discord_profile: 'HER9AL could not read your Discord profile. Please try again.',
      google_email_unverified: 'Your Google email is not verified. Verify it in Google, then try again.',
      google_config: 'Google sign-in is unavailable right now. Please try again later.',
      discord_config: 'Discord sign-in is unavailable right now. Please try again later.',
      database: 'We could not save your account right now. Please try again later.',
    };
    if (code && messages[code]) setError(messages[code]);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await fetch('/api/auth/email/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || 'Login failed.');
    location.href = '/profile';
  };

  return <main className="auth-wrap"><div className="auth-card auth-card-pro">
    <Link className="brand center" href="/"><img src="/her9al-logo.jpg" alt="HER9AL"/><span>HER9AL</span></Link>
    <h1>Welcome back.</h1>
    <p>Sign in with email, Google or Discord.</p>
    {error && <div className="error-box">{error}</div>}
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
      <button className="primary square" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
    </form>
    <div className="auth-divider"><span>OR</span></div>
    <a href="/api/auth/google" className="oauth">Continue with Google</a>
    <a href="/api/auth/discord" className="oauth">Continue with Discord</a>
    <small>New to HER9AL? <Link href="/signup">Create an account</Link></small>
  </div></main>;
}
