# HER9AL production release checklist

This checklist prepares a Preview deployment only. Do not merge to `main` or deploy Production until every manual check is signed off.

## 1. Supabase

1. Take a production backup and record which migrations have already run.
2. Apply pending migrations to a staging Supabase project first.
3. Review and apply `supabase/v10_distribution.sql`; it only adds Distribution tables/columns, indexes, RLS enablement, and the `release-audio` / `release-art` buckets.
4. Review and apply `supabase/v11_security_hardening.sql`; it adds only the API rate-limit table and function. Without it, the application safely falls back to per-instance memory limits, which are not sufficient as the long-term Vercel limit.
5. Verify existing counts and sample records in `app_users`, `beats`, `licenses`, `orders`, and `order_items` before and after. Verify the existing `beat-covers`, `beat-previews`, `beat-masters`, and `profile-avatars` buckets remain unchanged.

Never run destructive SQL, reset the database, or recreate existing buckets/data for this release.

## 2. Safe owner migration

Existing `owner` rows remain owners. First inspect by immutable ID:

```sql
select id, provider, provider_user_id, email, role
from public.app_users
where role = 'owner';
```

If and only if no legitimate owner exists, identify the already-authenticated account by its provider and immutable `id`, take a backup, and use a reviewed transaction:

```sql
begin;
select id, provider, provider_user_id, email, role
from public.app_users
where id = '<VERIFIED-USER-UUID>'
for update;

update public.app_users
set role = 'owner', updated_at = now()
where id = '<VERIFIED-USER-UUID>' and role = 'customer';

select id, provider, provider_user_id, email, role
from public.app_users
where role = 'owner';
-- Commit only after the selected identity and final owner set are verified.
commit;
```

Do not select or promote by email alone. Unauthenticated signup cannot grant `owner`; an existing owner may explicitly grant it through the admin role API. Demotion from `owner` remains an operator-only SQL task.

## 3. Vercel environment variables

Set variables separately for **Development**, **Preview**, and **Production**. Do not copy Production secrets into Preview unless the Preview is explicitly authorized to use the same external services.

| Variable | Development | Preview | Production | Notes |
|---|---:|---:|---:|---|
| `APP_URL` | Required | Required | Required | Exact context-specific origin; no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Required | Required | Public project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required | Required | Required | Public anon/publishable key; never use service role here |
| `SUPABASE_URL` | Optional | Optional | Optional | Server alias; falls back to public URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Required | Required | Server only |
| `AUTH_SECRET` | Required | Required | Required | At least 32 random bytes; keep stable per environment or sessions are invalidated |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Google login | For Google login | For Google login | Secret stays server only |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | For Discord login | For Discord login | For Discord login | Secret stays server only |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Optional | Optional | Optional | Both required for a complete payment flow; use test mode outside Production |
| `STORE_CURRENCY` | Optional | Optional | Optional | Three-letter lowercase code; defaults to `usd` |

`DISTRIBUTOR_API_URL` and `DISTRIBUTOR_API_KEY` do not enable delivery: the adapter is intentionally unimplemented. Do not add them until a real provider contract and tested adapter exist.

## 4. OAuth callback URLs

The application uses direct OAuth, not Supabase Auth providers. Register exact callbacks with Google and Discord:

- Production Google: `https://her9al-beatstore.vercel.app/api/auth/google/callback`
- Production Discord: `https://her9al-beatstore.vercel.app/api/auth/discord/callback`
- Preview: `<PREVIEW_APP_URL>/api/auth/google/callback` and `<PREVIEW_APP_URL>/api/auth/discord/callback`
- Development: `http://localhost:3000/api/auth/google/callback` and `http://localhost:3000/api/auth/discord/callback`

Use a stable Preview alias because Google generally requires an exact authorized redirect URI. `APP_URL` must match the registered context callback. Supabase Authentication redirect URLs are not used by the current direct OAuth routes; Supabase remains the database and Storage backend.

## 5. Preview verification

- Run `npm ci`, `npm audit`, and `npm run build`.
- Deploy only `distribution-preview` to Vercel Preview.
- Test `/`, `/beats`, a real beat detail page, preview playback, `/login`, `/signup`, `/profile`, `/library`, and checkout in Stripe test mode.
- Complete both Google and Discord login and verify invalid/mismatched OAuth state is rejected.
- Test customer, editor, admin, and protected-owner permissions.
- Upload valid/invalid cover and audio files; submit a single and a multi-track EP/album.
- Verify an artist sees only their releases and private audio is inaccessible without staff authorization.
- Exercise review, rejection, approval, manual delivery confirmation, live links, purchased-library access, and signed master download.
- Confirm no automatic DSP delivery claim appears and no production data was modified during Preview testing.
