'use client';

import SiteHeader from '@/components/SiteHeader';
import { useEffect, useState } from 'react';
import { CheckCircle2, Disc3, Plus, Trash2, Upload } from 'lucide-react';
import { GENRES, MOODS, STYLES } from '@/lib/catalog';

type UploadState = { kind: string; name: string; progress: number } | null;

const emptyBeat = {
  title: '', bpm: '', musical_key: '', mood: 'Dark', genre: 'Trap', style: 'Dark Trap', description: '',
  price: '29.99', license_name: 'Standard', file_format: 'WAV + MP3', release_type: 'single', album_id: '', published: true,
};

export default function Admin() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [beats, setBeats] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [tab, setTab] = useState<'beats' | 'albums' | 'users'>('beats');
  const [form, setForm] = useState<any>(emptyBeat);
  const [albumForm, setAlbumForm] = useState<any>({ title: '', cover_url: '', published: true });
  const [busy, setBusy] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>(null);

  const load = async () => {
    const r = await fetch('/api/admin/beats', { cache: 'no-store' });
    if (r.status === 403) { setAllowed(false); return; }
    if (r.status === 401) { location.href = '/login'; return; }
    setAllowed(true);
    const j = await r.json();
    setBeats(j.beats || []);
    const ar = await fetch('/api/admin/albums', { cache: 'no-store' });
    if (ar.ok) setAlbums((await ar.json()).albums || []);
    const ur = await fetch('/api/admin/users', { cache: 'no-store' });
    if (ur.ok) setUsers((await ur.json()).users || []);
  };

  useEffect(() => { load(); }, []);

  const upload = async (kind: string, file: File, target: 'beat' | 'album' = 'beat') => {
    setBusy(`Uploading ${kind}…`);
    setUploadState({ kind, name: file.name, progress: 0 });
    try {
      const signRes = await fetch('/api/admin/upload/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, name: file.name, contentType: file.type || 'application/octet-stream', size: file.size }),
      });
      const signed = await signRes.json();
      if (!signRes.ok) throw new Error(signed.error || 'Could not prepare upload');

      await new Promise<void>((resolve, reject) => {
        const fd = new FormData();
        fd.append('cacheControl', '3600');
        fd.append('', file);
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signed.signedUrl);
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadState({ kind, name: file.name, progress: Math.round((e.loaded / e.total) * 100) });
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error('Network error during direct upload'));
        xhr.send(fd);
      });

      if (target === 'album') setAlbumForm((x:any)=>({ ...x, cover_url: signed.publicUrl }));
      else setForm((x:any)=>({ ...x, [kind === 'master' ? 'master_path' : `${kind}_url`]: kind === 'master' ? signed.path : signed.publicUrl }));
      setUploadState({ kind, name: file.name, progress: 100 });
      setTimeout(()=>setUploadState(null),1500);
    } catch (error:any) {
      alert(error?.message || 'Upload failed');
      setUploadState(null);
    } finally {
      setBusy('');
    }
  };

  const addBeat = async () => {
    if (form.release_type === 'album' && !form.album_id) { alert('Choose an album first.'); return; }
    setBusy('Publishing…');
    const payload = { ...form, album_id: form.release_type === 'album' ? form.album_id : '' };
    const r = await fetch('/api/admin/beats', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) alert(j.error || 'Could not add beat'); else { setForm(emptyBeat); await load(); }
    setBusy('');
  };

  const addAlbum = async () => {
    setBusy('Creating album…');
    const r = await fetch('/api/admin/albums', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(albumForm) });
    const j = await r.json();
    if (!r.ok) alert(j.error || 'Could not create album'); else { setAlbumForm({ title:'',cover_url:'',published:true }); await load(); }
    setBusy('');
  };

  const delBeat = async (id:string)=>{if(!confirm('Delete this beat?'))return;await fetch('/api/admin/beats?id='+id,{method:'DELETE'});load();};
  const delAlbum = async (id:string)=>{if(!confirm('Delete this album? Beats will stay but become standalone.'))return;await fetch('/api/admin/albums?id='+id,{method:'DELETE'});load();};
  const role = async (id:string,v:string)=>{await fetch('/api/admin/users',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,role:v})});load();};

  if (allowed === null) return <main><SiteHeader/><div className="loading">Loading admin…</div></main>;
  if (!allowed) return <main><SiteHeader/><div className="forbidden"><h1>403</h1><p>This account is not a HER9AL admin.</p></div></main>;

  return <main><SiteHeader/><section className="admin-v4">
    <div className="admin-title"><div><span>OWNER / ADMIN PANEL</span><h1>HER9AL Studio</h1></div><div className="tabs">
      <button className={tab==='beats'?'active':''} onClick={()=>setTab('beats')}>Beats</button>
      <button className={tab==='albums'?'active':''} onClick={()=>setTab('albums')}>Albums</button>
      <button className={tab==='users'?'active':''} onClick={()=>setTab('users')}>Users & roles</button>
    </div></div>

    {tab==='beats'&&<div className="admin-grid"><div className="panel add-beat"><h2><Plus size={19}/> Add a beat</h2>
      <div className="form-grid">
        <label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
        <label>BPM<input type="number" value={form.bpm} onChange={e=>setForm({...form,bpm:e.target.value})}/></label>
        <label>Key<input value={form.musical_key} onChange={e=>setForm({...form,musical_key:e.target.value})} placeholder="F#m"/></label>
        <label>Genre<select value={form.genre} onChange={e=>setForm({...form,genre:e.target.value})}>{GENRES.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Style<select value={form.style} onChange={e=>setForm({...form,style:e.target.value})}>{STYLES.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Mood<select value={form.mood} onChange={e=>setForm({...form,mood:e.target.value})}>{MOODS.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Release type<select value={form.release_type} onChange={e=>setForm({...form,release_type:e.target.value,album_id:e.target.value==='single'?'':form.album_id})}><option value="single">Single beat</option><option value="album">Album / EP / Tape</option></select></label>
        {form.release_type==='album'&&<label>Album<select value={form.album_id} onChange={e=>setForm({...form,album_id:e.target.value})}><option value="">Choose album…</option>{albums.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label>}
        <label>Price ($)<input type="number" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label>
        <label>License<input value={form.license_name} onChange={e=>setForm({...form,license_name:e.target.value})}/></label>
        <label>File format<select value={form.file_format} onChange={e=>setForm({...form,file_format:e.target.value})}><option>WAV + MP3</option><option>WAV</option><option>MP3</option><option>WAV + MP3 + Stems</option></select></label>
      </div>
      <label className="wide-field">Beat bio / description<textarea rows={5} maxLength={1200} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe the beat, vibe, instruments, ideal artist/use, production notes…"/><span>{form.description.length}/1200</span></label>
      <div className="upload-row"><label className={form.cover_url?'done':''}><Upload size={16}/> Cover<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&upload('cover',e.target.files[0])}/></label><label className={form.preview_url?'done':''}><Upload size={16}/> Preview MP3<input type="file" accept="audio/*" onChange={e=>e.target.files?.[0]&&upload('preview',e.target.files[0])}/></label><label className={form.master_path?'done':''}><Upload size={16}/> Private master<input type="file" accept="audio/*,.zip" onChange={e=>e.target.files?.[0]&&upload('master',e.target.files[0])}/></label></div>
      {uploadState&&<div className="upload-progress-card admin-upload-progress"><div className="upload-progress-top"><span>{uploadState.progress===100?<><CheckCircle2 size={15}/> Uploaded {uploadState.name}</>:<>Uploading {uploadState.name}</>}</span><b>{uploadState.progress}%</b></div><div className="progress-track"><div className="progress-fill" style={{width:`${uploadState.progress}%`}}/></div></div>}
      <label className="check"><input type="checkbox" checked={!!form.published} onChange={e=>setForm({...form,published:e.target.checked})}/> Publish immediately</label>
      <button
        className="primary square"
        onClick={addBeat}
        disabled={
          !!busy ||
          !form.title ||
          !form.cover_url ||
          !form.preview_url ||
          (form.release_type === 'album' && !form.album_id)
        }
      >
        {busy && !busy.startsWith('Uploading')
          ? busy
          : form.release_type === 'album'
            ? 'Add track to album'
            : 'Publish single'}
      </button>
      {form.release_type==='album'&&<p className="tiny-note">An album can contain as many beats as you want. Create the album once in the Albums tab, then add each track to it here.</p>}
      {form.release_type==='single'&&<p className="tiny-note">Single beat publishes on its own and is not attached to an album.</p>}
      <p className="tiny-note">Genres, styles and moods are pre-built so the public catalog stays clean and searchable.</p>
    </div><div className="panel"><h2>Catalog ({beats.length})</h2><div className="admin-beat-list">{beats.map(b=><div className="admin-beat" key={b.id}><img src={b.cover_url||'/her9al-logo.jpg'}/><div><b>{b.title}</b><span>{b.published?'Live':'Draft'} · {b.genre||'—'} · {b.style||'—'} · {b.bpm||'—'} BPM</span></div><button onClick={()=>delBeat(b.id)}><Trash2 size={16}/></button></div>)}{!beats.length&&<p className="muted">No beats yet.</p>}</div></div></div>}

    {tab==='albums'&&<div className="admin-grid"><div className="panel"><h2><Disc3 size={19}/> Create an album / tape</h2><label>Album title<input value={albumForm.title} onChange={e=>setAlbumForm({...albumForm,title:e.target.value})} placeholder="HER9AL Vol. 1"/></label><div className="upload-row one"><label className={albumForm.cover_url?'done':''}><Upload size={16}/> Album cover<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&upload('cover',e.target.files[0],'album')}/></label></div>{albumForm.cover_url&&<img className="album-cover-preview" src={albumForm.cover_url}/>}<label className="check"><input type="checkbox" checked={albumForm.published} onChange={e=>setAlbumForm({...albumForm,published:e.target.checked})}/> Publish album</label><button className="primary square" onClick={addAlbum} disabled={!albumForm.title||!!busy}>{busy||'Create album'}</button><p className="tiny-note">After creating it, choose this album from the beat upload form. Singles can stay standalone.</p></div><div className="panel"><h2>Albums ({albums.length})</h2><div className="album-admin-list">{albums.map(a=><div className="album-admin-row" key={a.id}><img src={a.cover_url||'/her9al-logo.jpg'}/><div><b>{a.title}</b><span>{a.published?'Published':'Draft'} · {beats.filter(b=>b.album_id===a.id).length} track{beats.filter(b=>b.album_id===a.id).length===1?'':'s'}</span></div><button onClick={()=>delAlbum(a.id)}><Trash2 size={16}/></button></div>)}{!albums.length&&<p className="muted">No albums yet.</p>}</div></div></div>}

    {tab==='users'&&<div className="panel"><h2>Users & roles</h2><p className="subcopy">Owner/admin can promote an account after the user logs in once.</p><div className="users-table">{users.map(u=><div className="user-row" key={u.id}><img src={u.avatar_url||'/her9al-logo.jpg'}/><div><b>{u.display_name||u.email}</b><span>{u.email} · {u.provider}</span></div><select value={u.role} onChange={e=>role(u.id,e.target.value)}><option value="customer">Customer</option><option value="editor">Editor</option><option value="admin">Admin</option><option value="owner">Owner</option></select></div>)}</div></div>}
  </section></main>;
}
