create extension if not exists "pgcrypto";

-- HER9AL V4 uses its own OAuth session and app_users table.
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google','discord')),
  provider_user_id text not null,
  email text,
  display_name text,
  avatar_url text,
  role text not null default 'customer' check (role in ('owner','admin','editor','customer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_user_id)
);
create index if not exists app_users_email_idx on public.app_users(lower(email));

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_url text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.beats (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  bpm int,
  musical_key text,
  mood text,
  cover_url text,
  preview_url text,
  master_path text,
  album_id uuid references public.albums(id) on delete set null,
  published boolean not null default false,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.beats(id) on delete cascade,
  name text not null,
  price_cents int not null check(price_cents >= 0),
  file_format text default 'WAV + MP3',
  is_exclusive boolean not null default false,
  terms text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','paid','cancelled','refunded')),
  provider text,
  provider_ref text,
  total_cents int not null default 0,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  beat_id uuid not null references public.beats(id),
  license_id uuid not null references public.licenses(id),
  price_cents int not null,
  created_at timestamptz not null default now()
);

-- Storage buckets. Covers/previews are public; masters are private.
insert into storage.buckets (id,name,public,file_size_limit)
values ('beat-covers','beat-covers',true,8388608)
on conflict (id) do update set public=true;
insert into storage.buckets (id,name,public,file_size_limit)
values ('beat-previews','beat-previews',true,104857600)
on conflict (id) do update set public=true;
insert into storage.buckets (id,name,public,file_size_limit)
values ('beat-masters','beat-masters',false,104857600)
on conflict (id) do update set public=false;

-- All database and storage writes in V4 go through server-only service role routes.
-- Service role bypasses RLS. Browser clients do not need direct table access.
alter table public.app_users enable row level security;
alter table public.albums enable row level security;
alter table public.beats enable row level security;
alter table public.licenses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Optional read-only policies for public catalog if you ever query directly from browser.
drop policy if exists "public published beats" on public.beats;
create policy "public published beats" on public.beats for select using (published=true);
drop policy if exists "public active licenses" on public.licenses;
create policy "public active licenses" on public.licenses for select using (active=true);

-- V5 profile avatars: public user-uploaded PNG/JPG/JPEG/WEBP/GIF images.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  8388608,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update set
  public=true,
  file_size_limit=8388608,
  allowed_mime_types=array['image/png','image/jpeg','image/webp','image/gif'];

-- V7 catalog metadata (safe on new or upgraded projects)
alter table public.beats add column if not exists genre text;
alter table public.beats add column if not exists style text;
alter table public.beats add column if not exists description text;
create index if not exists beats_genre_idx on public.beats(genre);
create index if not exists beats_style_idx on public.beats(style);
create index if not exists beats_album_idx on public.beats(album_id);
drop policy if exists "public published albums" on public.albums;
create policy "public published albums" on public.albums for select using (published=true);
