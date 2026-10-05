-- HER9AL V7 catalog upgrade: safe to run on an existing V6 database.
alter table public.beats add column if not exists genre text;
alter table public.beats add column if not exists style text;
alter table public.beats add column if not exists description text;
create index if not exists beats_genre_idx on public.beats(genre);
create index if not exists beats_style_idx on public.beats(style);
create index if not exists beats_album_idx on public.beats(album_id);

-- Optional direct public album reads if you later query albums from the browser.
alter table public.albums enable row level security;
drop policy if exists "public published albums" on public.albums;
create policy "public published albums" on public.albums for select using (published=true);
