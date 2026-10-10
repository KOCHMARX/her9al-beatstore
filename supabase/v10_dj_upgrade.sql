-- HER9AL V10 DJ Studio
create table if not exists public.dj_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  audio_url text,
  cover_url text,
  soundcloud_url text,
  bpm numeric,
  source_type text not null default 'upload' check (source_type in ('upload','soundcloud','site')),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.dj_tracks enable row level security;
drop policy if exists "public published dj tracks" on public.dj_tracks;
create policy "public published dj tracks" on public.dj_tracks for select using (published=true);
create index if not exists dj_tracks_created_idx on public.dj_tracks(created_at desc);
