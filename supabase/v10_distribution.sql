-- HER9AL V10: Distribution Room (artist profiles + release submissions)
create table if not exists public.artist_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  artist_name text not null,
  bio text,
  country text,
  main_genre text,
  instagram text,
  spotify_url text,
  apple_music_url text,
  youtube_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null,
  release_type text not null default 'single' check (release_type in ('single','ep','album')),
  primary_artist text not null,
  featured_artists text,
  genre text,
  language text default 'English',
  explicit boolean not null default false,
  release_date date,
  label text,
  copyright_line text,
  cover_url text,
  cover_path text,
  tracks jsonb not null default '[]'::jsonb,   -- [{title, audio_path, explicit, isrc?}]
  platforms text[] not null default '{}',
  rights_confirmed boolean not null default false,
  status text not null default 'submitted'
    check (status in ('submitted','in_review','approved','delivered','live','rejected')),
  admin_note text,
  upc text,
  store_links jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists releases_user_idx on public.releases(user_id, created_at desc);
create index if not exists releases_status_idx on public.releases(status);

-- Safe when upgrading a project where an earlier V10 draft was already run.
alter table public.releases add column if not exists cover_path text;
alter table public.releases add column if not exists reviewed_by uuid references public.app_users(id) on delete set null;
alter table public.releases add column if not exists reviewed_at timestamptz;
alter table public.releases add column if not exists delivered_at timestamptz;

alter table public.artist_profiles enable row level security;
alter table public.releases enable row level security;
-- All access goes through server routes using the service role (same as V4+).

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'release-audio','release-audio',false,314572800,
  array['audio/wav','audio/x-wav','audio/wave','audio/flac','audio/x-flac','audio/mpeg']
)
on conflict (id) do update set
  public=false,
  file_size_limit=314572800,
  allowed_mime_types=array['audio/wav','audio/x-wav','audio/wave','audio/flac','audio/x-flac','audio/mpeg'];

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('release-art','release-art',true,10485760,array['image/png','image/jpeg'])
on conflict (id) do update set public=true, file_size_limit=10485760,
  allowed_mime_types=array['image/png','image/jpeg'];
