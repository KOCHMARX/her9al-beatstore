-- HER9AL V12: additive Distribution Room workflow.
-- PREPARED ONLY — DO NOT RUN until the project ref is confirmed as a dedicated
-- Preview/Staging project that is different from Production.
-- Idempotent: safe to run once on an empty or already-upgraded Staging project.

-- Artist profile image (public image URL only; uploaded to the public release-art bucket).
alter table public.artist_profiles add column if not exists image_url text;

-- Artist-visible rejection reason and staff-only private note.
alter table public.releases add column if not exists reject_reason text;
alter table public.releases add column if not exists private_note text;

-- Extend the status vocabulary. Previous values remain valid.
alter table public.releases drop constraint if exists releases_status_check;
alter table public.releases add constraint releases_status_check
  check (status in ('draft','submitted','in_review','changes_requested','approved','delivered','live','rejected'));

-- Append-only status history / audit trail. All access is through server routes
-- using the service role; browser clients get no direct grants.
create table if not exists public.release_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  actor_id uuid references public.app_users(id) on delete set null,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists release_events_release_idx on public.release_events(release_id, created_at);
alter table public.release_events enable row level security;
revoke all on table public.release_events from anon, authenticated;
