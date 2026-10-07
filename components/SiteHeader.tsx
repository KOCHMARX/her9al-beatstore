'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Library, LogOut, Settings, Shield } from 'lucide-react';

type Me = { id: string; display_name?: string | null; email?: string | null; avatar_url?: string | null; role?: string } | null;

function HeaderAvatar({ src, alt }: { src?: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return <img src={!src || broken ? '/her9al-logo.jpg' : src} alt={alt} onError={() => setBroken(true)} />;
}

export default function SiteHeader() {
  const [user, setUser] = useState<Me>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadUser = useCallback(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(r => r.json())
      .then(x => setUser(x.user || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadUser();
    const onProfile = () => loadUser();
    window.addEventListener('her9al-profile-updated', onProfile);
    return () => window.removeEventListener('her9al-profile-updated', onProfile);
  }, [loadUser]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <nav className="nav">
      <Link href="/" className="brand"><img src="/her9al-logo.jpg" alt="HER9AL" /><span>HER9AL</span></Link>
      <div className="navlinks">
        <Link href="/beats">Beats</Link>
        <Link href="/#rappers">Rappers</Link>
        {user ? (
          <div className="profile-menu" ref={ref}>
            <button className="profile-trigger" onClick={() => setOpen(!open)}>
              <HeaderAvatar src={user.avatar_url} alt="profile" />
              <span>{user.display_name || user.email || 'Profile'}</span>
              <ChevronDown size={15} />
            </button>
            {open && (
              <div className="profile-dropdown">
                <Link href="/profile"><Settings size={15} /> Profile</Link>
                <Link href="/library"><Library size={15} /> My beats</Link>
                {['owner', 'admin', 'editor'].includes(user.role || '') && <Link href="/admin"><Shield size={15} /> Admin</Link>}
                <a href="/api/auth/logout"><LogOut size={15} /> Logout</a>
              </div>
            )}
          </div>
        ) : <><Link href="/signup" className="signup-link">Sign up</Link><Link className="login-pill" href="/login">Login</Link></>}
      </div>
    </nav>
  );
}
