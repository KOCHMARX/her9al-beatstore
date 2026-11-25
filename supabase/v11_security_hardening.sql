-- HER9AL V11: additive, database-backed API rate limiting.
-- This does not alter users, beats, purchases, releases, or Storage objects.
create table if not exists public.api_rate_limits (
  key_hash text not null,
  action text not null,
  window_start timestamptz not null default now(),
  hits integer not null default 1 check (hits > 0),
  primary key (key_hash, action)
);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;
create index if not exists api_rate_limits_window_idx on public.api_rate_limits(window_start);

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_action text,
  p_window_seconds integer,
  p_max_hits integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_hits integer;
begin
  if length(p_key_hash) <> 64 or p_action !~ '^[A-Za-z0-9_-]{1,60}$' then
    raise exception 'invalid rate-limit key';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 or p_max_hits < 1 or p_max_hits > 10000 then
    raise exception 'invalid rate-limit settings';
  end if;

  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '7 days';
  end if;

  insert into public.api_rate_limits as limits (key_hash, action, window_start, hits)
  values (p_key_hash, p_action, now(), 1)
  on conflict (key_hash, action) do update set
    hits = case
      when limits.window_start <= now() - make_interval(secs => p_window_seconds) then 1
      else limits.hits + 1
    end,
    window_start = case
      when limits.window_start <= now() - make_interval(secs => p_window_seconds) then now()
      else limits.window_start
    end
  returning hits into current_hits;

  return current_hits <= p_max_hits;
end;
$$;

revoke all on function public.consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;
