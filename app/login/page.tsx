'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
