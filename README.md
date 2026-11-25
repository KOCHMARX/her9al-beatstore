# HER9AL Beat Store V4 — Complete

V4 fixes the missing post-login experience and turns the project into a real beat-store foundation:

- Direct Google + Discord OAuth (no Supabase Auth redirect dependency)
- Persistent HER9AL user account in `app_users`
- Login button becomes profile menu after login
- Editable display name/avatar
- `My Beats` library with permanent purchase history
- Paid master re-download using short-lived signed URLs
- Dynamic public beat catalog from database
- Admin beat upload: cover, preview, private master, BPM/key/mood/price/license
- Admin users/roles panel
- Private master storage; public cover/preview storage
- Stripe Checkout-ready card payment flow + webhook
- Responsive black / white / neon-red HER9AL design

## IMPORTANT: run the new SQL
Supabase → SQL Editor → New query → paste `supabase/schema.sql` → Run.
Expected: Success.

## Vercel environment variables
Keep your existing variables and add:

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Settings → API Keys → secret/service-role key. **Server-only. Never prefix with NEXT_PUBLIC.**
- `OWNER_EMAIL` — the exact Google/Discord email that should automatically become Owner on first login.

Existing direct-login variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`

Optional live card payments:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STORE_CURRENCY=usd`

If payment variables are missing, the rest of the website still works; checkout shows that payments are not configured instead of pretending a payment succeeded.

## Google redirect
`https://her9al-beatstore.vercel.app/api/auth/google/callback`

## Discord redirect
`https://her9al-beatstore.vercel.app/api/auth/discord/callback`

## First owner login
Set `OWNER_EMAIL` in Vercel to your login email, redeploy, then log out/log back in once. The account becomes `owner` automatically and can access `/admin`.

## Upload safety
Upload a shortened/watermarked MP3 as the preview. Upload the WAV/ZIP master separately. The master is stored in the private `beat-masters` bucket and is never exposed in the public catalog. Paid users receive a 60-second signed download URL.

No website can technically prevent someone from recording audio they can hear. Keeping masters private and only streaming a preview is the meaningful protection.
