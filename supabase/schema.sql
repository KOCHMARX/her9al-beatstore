create extension if not exists "pgcrypto";

create type public.user_role as enum ('owner','admin','editor','customer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role public.user_role not null default 'customer',
  created_at timestamptz default now()
);

create table public.beats (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  bpm int,
  musical_key text,
  mood text,
  cover_path text,
  preview_path text,
  master_path text,
  is_published boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid references public.beats(id) on delete cascade,
  name text not null,
  price_cents int not null,
  file_format text default 'MP3',
  is_exclusive boolean default false,
  terms text,
  active boolean default true
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  status text not null default 'pending',
  provider text,
  provider_ref text,
  total_cents int not null default 0,
  created_at timestamptz default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  beat_id uuid references public.beats(id),
  license_id uuid references public.licenses(id),
  price_cents int not null
);

alter table public.profiles enable row level security;
alter table public.beats enable row level security;
alter table public.licenses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "published beats public" on public.beats for select using (is_published = true);
create policy "licenses public" on public.licenses for select using (active = true);
create policy "users view own profile" on public.profiles for select using (auth.uid() = id);
create policy "users view own orders" on public.orders for select using (auth.uid() = user_id);
