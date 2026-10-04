import Link from 'next/link';
export default function LegacyCallback(){
  return <main className="auth-wrap"><div className="auth-card"><h1>Login updated.</h1><p>HER9AL now uses direct Google / Discord login.</p><Link className="oauth" href="/login">Back to login</Link></div></main>
}
