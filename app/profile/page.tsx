'use client';

import SiteHeader from '@/components/SiteHeader';
import Link from 'next/link';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, Music2 } from 'lucide-react';

export default function Profile() {
  const [u, setU] = useState<any>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [msg, setMsg] = useState('');
  const [avatarMsg, setAvatarMsg] = useState('');
  const [avatarProgress, setAvatarProgress] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/profile', { cache: 'no-store' })
      .then(async r => {
        if (r.status === 401) {
          location.href = '/login';
          return null;
        }
        return r.json();
      })
      .then(j => {
        if (j?.user) {
          setU(j.user);
          setName(j.user.display_name || '');
          setAvatar(j.user.avatar_url || '');
        }
      });
  }, []);

  const save = async () => {
    setMsg('Saving…');
    const r = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: name, avatar_url: avatar }),
    });
    const j = await r.json();
    setU(j.user || u);
    if (r.ok) window.dispatchEvent(new Event('her9al-profile-updated'));
    setMsg(r.ok ? 'Profile saved.' : (j.error || 'Could not save.'));
  };

  const uploadAvatar = (file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setAvatarMsg('Use PNG, JPG/JPEG, WEBP or GIF.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarMsg('Maximum image size is 8 MB.');
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setAvatar(localPreview);
    setAvatarProgress(0);
    setAvatarBusy(true);
    setAvatarMsg(`Uploading ${file.name}…`);

    const fd = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/profile/avatar');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) setAvatarProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setAvatarBusy(false);
      try {
        const j = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          setAvatar(j.url || localPreview);
          setU(j.user || u);
          window.dispatchEvent(new Event('her9al-profile-updated'));
          setAvatarProgress(100);
          setAvatarMsg('Profile photo uploaded.');
        } else {
          setAvatarMsg(j.error || 'Upload failed.');
        }
      } catch {
        setAvatarMsg('Upload failed.');
      }
      setTimeout(() => URL.revokeObjectURL(localPreview), 1200);
    };
    xhr.onerror = () => {
      setAvatarBusy(false);
      setAvatarMsg('Network error while uploading.');
    };
    xhr.send(fd);
  };

  const onAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAvatar(file);
    e.target.value = '';
  };

  return (
    <main>
      <SiteHeader />
      <section className="account-wrap">
        {u && (
          <>
            <div className="profile-hero">
              <div className="avatar-editor" onClick={() => inputRef.current?.click()}>
                <img src={avatar || '/her9al-logo.jpg'} alt="avatar" />
                <div className="avatar-overlay"><Camera size={22} /><span>Change</span></div>
              </div>
              <div>
                <span>MY ACCOUNT</span>
                <h1>{name || u.email}</h1>
                <p>{u.email} · {u.provider} · {u.role}</p>
              </div>
            </div>

            <input
              ref={inputRef}
              className="hidden-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              onChange={onAvatarChange}
            />

            <div className="account-grid">
              <div className="panel profile-panel">
                <h2><ImagePlus size={19} /> Customize profile</h2>
                <p className="profile-help">Upload your own profile picture. PNG, JPG/JPEG, WEBP and animated GIF are supported.</p>

                <button className="avatar-upload-btn" onClick={() => inputRef.current?.click()} disabled={avatarBusy}>
                  <Camera size={17} /> {avatarBusy ? 'Uploading…' : 'Upload profile picture'}
                </button>

                {(avatarBusy || avatarProgress > 0) && (
                  <div className="upload-progress-card">
                    <div className="upload-progress-top">
                      <span>{avatarMsg || 'Uploading image…'}</span>
                      <b>{avatarProgress}%</b>
                    </div>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${avatarProgress}%` }} /></div>
                  </div>
                )}

                {!avatarBusy && avatarMsg && avatarProgress === 0 && <p className="error-box">{avatarMsg}</p>}
                {!avatarBusy && avatarProgress === 100 && <p className="upload-success"><CheckCircle2 size={16}/> {avatarMsg}</p>}

                <label>Display name<input value={name} onChange={e => setName(e.target.value)} maxLength={50} /></label>
                <button className="primary square" onClick={save}>Save profile</button>
                {msg && <p className="status-msg">{msg}</p>}
              </div>

              <div className="panel music-library-card">
                <div className="library-icon"><Music2 size={24}/></div>
                <h2>Your music</h2>
                <p>Every paid beat stays linked to your HER9AL account. Download your purchased files again whenever you need them.</p>
                <Link href="/library" className="secondary inline-btn">Open My Beats</Link>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
