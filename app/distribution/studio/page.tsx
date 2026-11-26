'use client';

import SiteHeader from '@/components/SiteHeader';
import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Disc3, Music2, Plus, Trash2, User, UploadCloud } from 'lucide-react';
import { GENRES } from '@/lib/catalog';
import { EDITABLE_STATUSES, PLATFORMS, LANGUAGES, STATUS_LABEL } from '@/lib/distribution';

type TrackRow = { title: string; audio_path: string; fileName: string; explicit: boolean; busy: boolean };
const emptyTrack = (): TrackRow => ({ title: '', audio_path: '', fileName: '', explicit: false, busy: false });

async function upload(kind: 'audio' | 'art', file: File) {
  const r = await fetch('/api/distribution/upload', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, name: file.name, contentType: file.type, size: file.size }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Upload failed.');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await sb.storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, file, { contentType: j.contentType });
  if (error) throw new Error(error.message);
  return j as { path: string; publicUrl: string | null; contentType: string };
}

function imageSize(file: File) {
  return new Promise<{ w: number; h: number }>((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { res({ w: img.width, h: img.height }); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Invalid image.')); }; img.src = url;
  });
}

export default function Studio() {
  const [tab, setTab] = useState<'profile' | 'release' | 'mine'>('profile');
  const [ready, setReady] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [p, setP] = useState({ artist_name: '', bio: '', country: '', main_genre: 'Hip Hop', instagram: '', spotify_url: '', apple_music_url: '', youtube_url: '' });
  const setPF = (k: string, v: string) => setP(s => ({ ...s, [k]: v }));

  const [rel, setRel] = useState({ title: '', release_type: 'single', featured_artists: '', genre: 'Hip Hop', language: 'English', release_date: '', label: '', copyright_line: '' });
  const setRF = (k: string, v: string) => setRel(s => ({ ...s, [k]: v }));
  const [tracks, setTracks] = useState<TrackRow[]>([emptyTrack()]);
  const [cover, setCover] = useState<{ url: string; path: string; busy: boolean }>({ url: '', path: '', busy: false });
  const [platforms, setPlatforms] = useState<string[]>(['Spotify', 'Apple Music']);
  const [rights, setRights] = useState(false);
  const [mine, setMine] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [artistImage, setArtistImage] = useState('');

  const loadMine = useCallback(() => fetch('/api/distribution/releases', { cache: 'no-store' }).then(async r => {
    if (r.status === 401) { location.href = '/login'; return null; }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'Could not load releases.');
    return body;
  }).then(j => { if (j) setMine(j.releases || []); }).catch(e => setErr(e.message)), []);

  useEffect(() => {
    fetch('/api/distribution/artist', { cache: 'no-store' }).then(async r => {
      if (r.status === 401) { location.href = '/login'; return null; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load your artist profile.');
      return j;
    }).then(j => {
      if (!j) return;
      if (j.profile) {
        setHasProfile(true);
        setP(s => ({ ...s, ...Object.fromEntries(Object.entries(j.profile).map(([k, v]) => [k, v ?? ''])) }));
        setArtistImage(j.profile.image_url || '');
        setTab('release');
      }
      setReady(true);
    }).catch(e => setErr(e.message));
    loadMine();
  }, [loadMine]);

  const saveProfile = async () => {
    setBusy(true); setErr(''); setMsg('');
    const r = await fetch('/api/distribution/artist', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error || 'Could not save.');
    setHasProfile(true); setMsg('Artist profile saved.'); setTab('release');
  };

  const pickCover = async (f?: File) => {
    if (!f) return; setErr('');
    try {
      const { w, h } = await imageSize(f);
      if (w !== h) throw new Error('Cover art must be square (e.g. 3000×3000).');
      if (w < 1400) throw new Error('Cover art must be at least 1400×1400 (3000×3000 recommended).');
      setCover({ url: '', path: '', busy: true });
      const up = await upload('art', f);
      setCover({ url: up.publicUrl || '', path: up.path, busy: false });
    } catch (e: any) { setCover({ url: '', path: '', busy: false }); setErr(e.message); }
  };

  const pickAudio = async (i: number, f?: File) => {
    if (!f) return; setErr('');
    setTracks(t => t.map((x, k) => k === i ? { ...x, busy: true, fileName: f.name, title: x.title || f.name.replace(/\.[^.]+$/, '') } : x));
    try {
      const up = await upload('audio', f);
      setTracks(t => t.map((x, k) => k === i ? { ...x, busy: false, audio_path: up.path } : x));
    } catch (e: any) {
      setTracks(t => t.map((x, k) => k === i ? { ...x, busy: false, fileName: '', audio_path: '' } : x)); setErr(e.message);
    }
  };

  const resetForm = () => {
    setRel({ title: '', release_type: 'single', featured_artists: '', genre: 'Hip Hop', language: 'English', release_date: '', label: '', copyright_line: '' });
    setTracks([emptyTrack()]); setCover({ url: '', path: '', busy: false }); setRights(false); setEditingId(null);
  };

  const sendRelease = async (submitForReview: boolean) => {
    setBusy(true); setErr(''); setMsg('');
    const body = {
      ...rel, cover_path: cover.path, platforms, rights_confirmed: rights,
      tracks: tracks.map(({ title, audio_path, explicit }) => ({ title, audio_path, explicit })),
      ...(editingId ? { id: editingId, submit: submitForReview } : { save_draft: !submitForReview }),
    };
    const r = await fetch('/api/distribution/releases', {
      method: editingId ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error || 'Could not save release.');
    setMsg(submitForReview ? 'Release submitted for review. You can follow every status change here.'
      : 'Draft saved. Finish the required fields and submit when you are ready.');
    if (submitForReview) resetForm();
    loadMine(); setTab('mine');
  };

  const uploadArtistImage = async (f?: File) => {
    if (!f) return;
    setErr(''); setBusy(true);
    try {
      const form = new FormData(); form.set('file', f);
      const r = await fetch('/api/distribution/artist/image', { method: 'POST', body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not upload image.');
      setArtistImage(j.image_url); setPF('image_url', j.image_url); setMsg('Artist image saved.');
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const openDetail = async (id: string) => {
    setErr('');
    try {
      const r = await fetch(`/api/distribution/releases?id=${id}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load release.');
      setDetail(j.release);
    } catch (e: any) { setErr(e.message); }
  };

  const startEdit = async (r: any) => {
    setErr('');
    try {
      const response = await fetch(`/api/distribution/releases?id=${r.id}`, { cache: 'no-store' });
      const j = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(j.error || 'Could not load release.');
      const d = j.release;
      setRel({
        title: d.title || '', release_type: d.release_type || 'single', featured_artists: d.featured_artists || '',
        genre: d.genre || 'Hip Hop', language: d.language || 'English', release_date: d.release_date || '',
        label: d.label || '', copyright_line: d.copyright_line || '',
      });
      const nextTracks = (d.tracks || []).map((t: any) => ({ title: t.title || '', audio_path: t.audio_path || '', fileName: '', explicit: !!t.explicit, busy: false }));
      setTracks(nextTracks.length ? nextTracks : [emptyTrack()]);
      setCover({ url: d.cover_url || '', path: d.cover_path || '', busy: false });
      setPlatforms(d.platforms || []); setRights(!!d.rights_confirmed); setEditingId(d.id);
      setMsg('Editing draft. Submit again when it is ready.');
      setTab('release');
    } catch (e: any) { setErr(e.message); }
  };

  const uploading = cover.busy || tracks.some(t => t.busy);
  const togglePlatform = (x: string) => setPlatforms(s => s.includes(x) ? s.filter(y => y !== x) : [...s, x]);

  return (
    <main>
      <SiteHeader />
      <section className="account-wrap">
        <div className="section-head"><div><span>DISTRIBUTION STUDIO</span><h1>Get your release ready.</h1>
          <p className="subcopy">Set up your artist profile, upload a release and follow its review status.</p></div></div>

        <div className="dist-tabs">
          <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}><User size={15} /> Artist profile</button>
          <button className={tab === 'release' ? 'on' : ''} onClick={() => { setErr(''); resetForm(); setTab(hasProfile ? 'release' : 'profile'); }}><UploadCloud size={15} /> New release</button>
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}><Disc3 size={15} /> My releases ({mine.length})</button>
        </div>
        {err && <div className="error-box" role="alert">{err}</div>}
        {msg && <div className="dist-ok" role="status"><CheckCircle2 size={16} /> {msg}</div>}
        {ready && !hasProfile && (
          <div className="panel dist-empty">
            <User size={20} />
            <div>
              <h2>Create your artist profile first</h2>
              <p>You don’t have an artist profile yet. Add your artist name and details below, then you can upload a single, EP or album.</p>
            </div>
          </div>
        )}

        {ready && tab === 'profile' && (
          <div className="panel">
            <h2><User size={19} /> Artist profile</h2>
            <p className="profile-help">This is the identity used in your delivery package.</p>
            <div className="dist-cover">
              <img src={artistImage || '/her9al-logo.jpg'} alt="Artist" />
              <div><p className="profile-help">Artist image (optional). Square PNG/JPG, up to 10 MB.</p>
                <label className="secondary small dist-file" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement)?.click(); } }}>
                  {busy ? 'Uploading…' : artistImage ? 'Change image' : 'Upload artist image'}
                  <input className="hidden-file" type="file" accept="image/png,image/jpeg" onChange={e => { uploadArtistImage(e.target.files?.[0]); e.target.value = ''; }} />
                </label></div>
            </div>
            <div className="form-grid">
              <label>Artist name *<input value={p.artist_name} maxLength={60} onChange={e => setPF('artist_name', e.target.value)} /></label>
              <label>Country<input value={p.country} onChange={e => setPF('country', e.target.value)} /></label>
              <label>Main genre<select value={p.main_genre} onChange={e => setPF('main_genre', e.target.value)}>{GENRES.map(g => <option key={g}>{g}</option>)}</select></label>
              <label>Instagram<input placeholder="@username" value={p.instagram} onChange={e => setPF('instagram', e.target.value)} /></label>
              <label>Spotify artist URL (if you have one)<input value={p.spotify_url} onChange={e => setPF('spotify_url', e.target.value)} /></label>
              <label>Apple Music artist URL (if you have one)<input value={p.apple_music_url} onChange={e => setPF('apple_music_url', e.target.value)} /></label>
              <label>YouTube channel URL<input value={p.youtube_url} onChange={e => setPF('youtube_url', e.target.value)} /></label>
            </div>
            <div className="wide-field"><label>Bio<textarea rows={4} maxLength={1000} value={p.bio} onChange={e => setPF('bio', e.target.value)} /></label></div>
            <button className="primary" disabled={busy} onClick={saveProfile}>{busy ? 'Saving…' : 'Save artist profile'}</button>
          </div>
        )}

        {ready && tab === 'release' && (
          <div className="panel">
            <h2><Music2 size={19} /> New release</h2>
            <div className="form-grid">
              <label>Release title *<input value={rel.title} onChange={e => setRF('title', e.target.value)} /></label>
              <label>Type<select value={rel.release_type} onChange={e => setRF('release_type', e.target.value)}><option value="single">Single</option><option value="ep">EP</option><option value="album">Album</option></select></label>
              <label>Featured artists<input value={rel.featured_artists} onChange={e => setRF('featured_artists', e.target.value)} /></label>
              <label>Genre<select value={rel.genre} onChange={e => setRF('genre', e.target.value)}>{GENRES.map(g => <option key={g}>{g}</option>)}</select></label>
              <label>Language<select value={rel.language} onChange={e => setRF('language', e.target.value)}>{LANGUAGES.map(g => <option key={g}>{g}</option>)}</select></label>
               <label>Release date * (min. 7 days ahead)<input type="date" required min={new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)} value={rel.release_date} onChange={e => setRF('release_date', e.target.value)} /></label>
              <label>Label (optional)<input placeholder={p.artist_name} value={rel.label} onChange={e => setRF('label', e.target.value)} /></label>
              <label>Copyright line (optional)<input placeholder={`℗ ${new Date().getFullYear()} ${p.artist_name}`} value={rel.copyright_line} onChange={e => setRF('copyright_line', e.target.value)} /></label>
            </div>

            <h3 className="dist-sub">Cover art</h3>
            <div className="dist-cover">
              <img src={cover.url || '/her9al-logo.jpg'} alt="cover" />
              <div><p className="profile-help">Square JPG/PNG, 3000×3000 recommended (min 1400×1400). No logos of stores, no blurry images.</p>
                <label className="secondary small dist-file" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement)?.click(); } }}>{cover.busy ? 'Uploading…' : cover.url ? 'Change cover' : 'Upload cover'}
                  <input className="hidden-file" type="file" accept="image/png,image/jpeg" onChange={e => { pickCover(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
            </div>

            <h3 className="dist-sub">Tracks</h3>
            {tracks.map((t, i) => (
              <div className="dist-track" key={i}>
                <b>{i + 1}</b>
                <input aria-label={`Track ${i + 1} title`} placeholder="Track title" value={t.title} onChange={e => setTracks(s => s.map((x, k) => k === i ? { ...x, title: e.target.value } : x))} />
                <label className="secondary small dist-file" tabIndex={0} aria-label={`Upload audio for track ${i + 1}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement)?.click(); } }}>{t.busy ? 'Uploading…' : t.audio_path ? `✓ ${t.fileName.slice(0, 22)}` : 'Upload WAV/FLAC/MP3'}
                  <input className="hidden-file" type="file" accept=".wav,.flac,.mp3,audio/wav,audio/flac,audio/mpeg" onChange={e => { pickAudio(i, e.target.files?.[0]); e.target.value = ''; }} /></label>
                <label className="dist-check"><input type="checkbox" checked={t.explicit} onChange={e => setTracks(s => s.map((x, k) => k === i ? { ...x, explicit: e.target.checked } : x))} /> Explicit</label>
                {tracks.length > 1 && <button className="dist-icon" onClick={() => setTracks(s => s.filter((_, k) => k !== i))} aria-label="Remove track"><Trash2 size={15} /></button>}
              </div>
            ))}
            {tracks.length < 20 && <button className="secondary small" onClick={() => setTracks(s => [...s, emptyTrack()])}><Plus size={15} /> Add track</button>}

            <h3 className="dist-sub">Platforms</h3>
            <div className="chips dist-pick">{PLATFORMS.map(x => <button type="button" key={x} className={platforms.includes(x) ? 'on' : ''} onClick={() => togglePlatform(x)}>{x}</button>)}</div>

            <label className="dist-check dist-rights"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} />
              I confirm I own or control 100% of the rights to this music (including beats and samples) and have the licenses needed to distribute it.</label>
            <div className="cta">
              <button className="primary" disabled={busy || uploading || !rights || !rel.title.trim() || !rel.release_date || !cover.path || tracks.some(t => !t.title.trim() || !t.audio_path)} onClick={() => sendRelease(true)}>
                {busy ? 'Saving…' : uploading ? 'Uploading files…' : editingId ? 'Save changes & resubmit' : 'Submit for review'}
              </button>
              <button className="secondary small" disabled={busy || uploading || !rel.title.trim()} onClick={() => sendRelease(false)}>
                {editingId ? 'Save draft' : 'Save draft & continue later'}
              </button>
              {editingId && <button className="secondary small" onClick={() => { resetForm(); setMsg('Editing cancelled.'); }}>Cancel edit</button>}
            </div>
            <p className="profile-help"><strong>Before you submit:</strong> HER9AL prepares a delivery package; an authorized distributor must deliver it. The platforms selected above are requests, not guaranteed destinations.</p>
            <p className="profile-help">Using a HER9AL beat? Check the license terms shown on the beat, at checkout and in your library before submitting — streaming distribution is only allowed where those terms permit it.</p>
            <p className="profile-help">Submissions are reviewed by HER9AL. Store delivery is manual through a licensed distributor unless a tested provider integration is added; submission alone does not publish music to a platform.</p>
          </div>
        )}

        {ready && tab === 'mine' && (
          <div className="library-list">
            {mine.map(r => (
              <article className="panel dist-release" key={r.id}>
                <img src={r.cover_url || '/her9al-logo.jpg'} alt="" />
                <div>
                  <h3>{r.title} <small className="dist-badge" data-s={r.status}>{STATUS_LABEL[r.status] || r.status}</small></h3>
                  <p>{r.release_type.toUpperCase()} · {r.tracks.length} track(s) · {r.release_date || 'No date'} · {r.platforms.join(', ')}</p>
                  {r.reject_reason && <p className="dist-note" role="status">Reason from HER9AL: {r.reject_reason}</p>}
                  {r.admin_note && <p className="dist-note">Note from HER9AL: {r.admin_note}</p>}
                  <div className="dist-links">
                    {(EDITABLE_STATUSES as readonly string[]).includes(r.status) && <button className="dist-link" onClick={() => startEdit(r)}>Edit &amp; resubmit</button>}
                    <button className="dist-link" onClick={() => openDetail(r.id)}>Details &amp; history</button>
                    {r.store_links?.spotify && <a href={r.store_links.spotify} target="_blank" rel="noreferrer">Spotify</a>}
                    {r.store_links?.apple && <a href={r.store_links.apple} target="_blank" rel="noreferrer">Apple Music</a>}
                    {r.store_links?.youtube && <a href={r.store_links.youtube} target="_blank" rel="noreferrer">YouTube</a>}
                  </div>
                </div>
              </article>
            ))}
            {!mine.length && <div className="empty-state">No releases yet. <button className="dist-link" onClick={() => setTab(hasProfile ? 'release' : 'profile')}>Create your first release</button></div>}
            {detail && (
              <article className="panel dist-detail">
                <div className="section-head"><div><span>RELEASE DETAIL</span><h2>{detail.title}</h2></div><button className="secondary small" onClick={() => setDetail(null)}>Close</button></div>
                <p>Status: <b>{STATUS_LABEL[detail.status] || detail.status}</b> · {detail.release_type} · {detail.tracks?.length || 0} track(s) · {detail.release_date || 'No date'}</p>
                {detail.reject_reason && <p className="dist-note">Reason: {detail.reject_reason}</p>}
                {detail.admin_note && <p className="dist-note">Note from HER9AL: {detail.admin_note}</p>}
                <p className="profile-help">Delivery is manual through a licensed distributor. A status of “Delivery package prepared” or “Live (confirmed)” means an administrator confirmed the real workflow.</p>
                <h3 className="dist-sub">Status history</h3>
                {detail.events?.length ? (
                  <ul className="dist-timeline">
                    {detail.events.map((e: any) => <li key={e.id}><b>{STATUS_LABEL[e.to_status] || e.to_status}</b> · {new Date(e.created_at).toLocaleString()}{e.note ? ` — ${e.note}` : ''}</li>)}
                  </ul>
                ) : <p className="profile-help">No history recorded for this release yet.</p>}
              </article>
            )}
            {mine.some(r => r.status === 'live') && (
              <div className="panel"><h3>Claim your artist profile</h3>
                <p>HER9AL confirmed this release is live. Claim your platform profile if you have an artist account:</p>
                <div className="dist-links"><a href="https://artists.spotify.com" target="_blank" rel="noreferrer">Spotify for Artists</a><a href="https://artists.apple.com" target="_blank" rel="noreferrer">Apple Music for Artists</a></div></div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
