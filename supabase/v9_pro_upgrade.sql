-- HER9AL V9: email/password accounts + larger beat masters.
alter table public.app_users add column if not exists password_hash text;
alter table public.app_users drop constraint if exists app_users_provider_check;
alter table public.app_users add constraint app_users_provider_check check (provider in ('google','discord','email'));
create unique index if not exists app_users_email_credentials_unique on public.app_users(lower(email)) where provider='email';

update storage.buckets
set file_size_limit = 524288000
where id = 'beat-masters';

update storage.buckets
set file_size_limit = 104857600
where id = 'beat-previews';
