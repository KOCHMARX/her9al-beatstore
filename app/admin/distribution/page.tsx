'use client';

import SiteHeader from '@/components/SiteHeader';
import { useEffect, useState } from 'react';
import { STATUS_LABEL } from '@/lib/distribution';

export default function AdminDistribution() {
  const [items, setItems] = useState<any[]>([]);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState('');
  const [viewerRole, setViewerRole] = useState('');

  const load = () => fetch('/api/admin/releases', { cache: 'no-store' }).then(async r => {
    if (r.status === 401 || r.status === 403) { location.href = '/login'; return { releases: [] }; }
    return r.json();
  }).then(j => { setItems(j.releases || []); setViewerRole(j.viewerRole || ''); setReady(true); });
  useEffect(() => { load(); }, []);

  const edit = (id: string, patch: any) => setItems(s => s.map(r => r.id === id ? { ...r, ...patch } : r));
  const save = async (r: any) => {
    const deliveryStatus = r.status === 'delivered' || r.status === 'live';
    const deliveryConfirmed = !deliveryStatus || window.confirm('Confirm only if this release was actually delivered through a licensed distributor. Continue?');
    if (!deliveryConfirmed) return;
    setMsg('Saving…');
    const res = await fetch('/api/admin/releases', { method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: r.id, status: r.status, admin_note: r.admin_note, upc: r.upc, store_links: r.store_links, delivery_confirmed: deliveryStatus }) });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? 'Saved.' : j.error || 'Error.');
  };

  return (
    <main>
      <SiteHeader />
      <section className="section page">
        <div className="section-head"><div><span>ADMIN</span><h1>Distribution queue.</h1>
          <p className="subcopy">Review submissions, download files, deliver via your distributor, then mark them live.</p></div></div>
        <div className="panel dist-disclaimer"><div><strong>Manual delivery mode</strong><p>No automatic Spotify/Apple delivery adapter is implemented. Download approved assets, deliver them through the licensed distributor account, and only then choose Delivered or Live. Editors may review; only owners/admins can confirm delivery.</p></div></div>
        {msg && <div className="dist-ok">{msg}</div>}
        <div className="library-list">
          {items.map(r => (
            <article className="panel dist-admin" key={r.id}>
              <div className="dist-release"><img src={r.cover_url} alt="" />
                <div><h3>{r.title} — {r.primary_artist}</h3>
                  <p>{r.release_type.toUpperCase()} · {r.genre} · {r.release_date || 'No date'} · {r.platforms.join(', ')}</p>
                  <p>Artist: {r.artist?.artist_name} ({r.artist?.country || '—'}) · rights confirmed: {r.rights_confirmed ? 'yes' : 'no'}</p>
                  <div className="dist-links">{r.files.map((f: any, i: number) => f.url && <a key={i} href={f.url} target="_blank" rel="noreferrer">⬇ {f.title}</a>)}</div></div></div>
              <div className="form-grid">
                 <label>Status<select value={r.status} onChange={e => edit(r.id, { status: e.target.value })}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k} disabled={['delivered','live'].includes(k)&&!['owner','admin'].includes(viewerRole)}>{v}</option>)}</select></label>
                <label>UPC<input value={r.upc || ''} onChange={e => edit(r.id, { upc: e.target.value })} /></label>
                <label>Spotify link<input value={r.store_links?.spotify || ''} onChange={e => edit(r.id, { store_links: { ...r.store_links, spotify: e.target.value } })} /></label>
                <label>Apple Music link<input value={r.store_links?.apple || ''} onChange={e => edit(r.id, { store_links: { ...r.store_links, apple: e.target.value } })} /></label>
                <label>YouTube link<input value={r.store_links?.youtube || ''} onChange={e => edit(r.id, { store_links: { ...r.store_links, youtube: e.target.value } })} /></label>
                <label>Note to artist<input value={r.admin_note || ''} onChange={e => edit(r.id, { admin_note: e.target.value })} /></label>
              </div>
              <div className="cta">
                <button className="primary small" onClick={() => save(r)}>Save</button>
                <button className="secondary small" onClick={() => { navigator.clipboard.writeText(JSON.stringify(r.package, null, 2)); setMsg('Delivery package copied.'); }}>Copy delivery package</button>
              </div>
            </article>
          ))}
          {ready && !items.length && <div className="empty-state">No submissions yet.</div>}
        </div>
      </section>
    </main>
  );
}
