'use client';

import SiteHeader from '@/components/SiteHeader';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Library() {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    fetch('/api/library', { cache: 'no-store' })
      .then(async r => {
        if (r.status === 401) { location.href = '/login'; return null; }
        if (!r.ok) throw new Error('library_failed');
        const j = await r.json();
        if (!Array.isArray(j.items)) throw new Error('library_invalid');
        return j.items as any[];
      })
      .then(next => {
        if (!active || !next) return;
        setItems(next);
        setStatus('ready');
      })
      .catch(error => {
        if (!active) return;
        console.error('HER9AL LIBRARY CLIENT ERROR', error);
        setStatus('error');
      });
    return () => { active = false; };
  }, []);

  return <main>
    <SiteHeader />
    <section className="section page">
      <div className="section-head"><div><span>MY LIBRARY</span><h1>Your beats.</h1><p className="subcopy">Re-download your licensed masters whenever you need them.</p></div></div>
      <div className="library-list">
        {status === 'ready' && items.map(x => <article className="library-item" key={x.id}><img src={x.beat?.cover_url || '/her9al-logo.jpg'} alt="" /><div><h3>{x.beat?.title}</h3><p>{x.license?.name} · {x.license?.file_format} · {Number(x.price_cents) === 0 ? 'Free' : `$${(x.price_cents / 100).toFixed(2)}`}</p>{x.license?.terms && <p className="subcopy">License terms: {x.license.terms}</p>}</div><a className="primary small" href={`/api/library/download?item=${x.id}`}><Download size={16} /> Download</a></article>)}
        {status === 'loading' && <div className="empty-state" role="status">Loading your library…</div>}
        {status === 'error' && <div className="error-box" role="alert">Your library could not be loaded right now. Please try again shortly.</div>}
        {status === 'ready' && !items.length && <div className="empty-state">You have no beats yet. Claimed free downloads and purchases will appear here automatically.</div>}
      </div>
    </section>
  </main>;
}
