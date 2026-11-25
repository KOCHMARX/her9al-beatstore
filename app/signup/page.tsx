'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true); setError('');
    const r = await fetch('/api/auth/email/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ display_name: name, email, password }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || 'Could not create account.');
    location.href = '/profile';
  };

  return <main className="auth-wrap"><div className="auth-card auth-card-pro">
    <Link className="brand center" href="/"><img src="/her9al-logo.jpg" alt="HER9AL"/><span>HER9AL</span></Link>
    <h1>Create account.</h1>
    <p>Email & password, or create your account instantly with Google / Discord.</p>
    {error && <div className="error-box">{error}</div>}
    <form className="auth-form" onSubmit={submit}>
      <label>Display name<input value={name} onChange={e=>setName(e.target.value)} maxLength={50} placeholder="Your producer / artist name"/></label>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
      <label>Password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
      <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label>
      <button className="primary square" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
    </form>
    <div className="auth-divider"><span>OR</span></div>
    <a href="/api/auth/google" className="oauth">Sign up with Google</a>
    <a href="/api/auth/discord" className="oauth">Sign up with Discord</a>
    <small>Already have an account? <Link href="/login">Login</Link></small>
  </div></main>;
}
