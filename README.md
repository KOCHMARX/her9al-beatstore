# HER9AL Beatstore

Next.js 15 / React 19 beat store with direct Google, Discord, and email authentication; a Supabase-backed catalog and private purchase library; Stripe Checkout support; admin tools; and the HER9AL Distribution Room.

## Preserved store features

- Dynamic beat and album catalog with public audio previews
- Private paid masters delivered with short-lived signed URLs
- Persistent users, roles, orders, and purchase history in Supabase
- Google, Discord, and email/password login
- Admin beat, album, upload, and role-management tools
- Existing HER9AL design, logo, player, profile, library, and checkout flow

## Distribution Room

- Artist profiles
- Single, EP, and album submissions with multiple tracks
- Direct-to-Supabase cover/audio uploads
- Platform selection, rights confirmation, release date, artist dashboard, and admin review queue
- Submitted, in-review, approved, delivered, live, and rejected statuses

Delivery is currently **manual through a licensed distributor**. No automatic Spotify, Apple Music, or other DSP adapter is implemented. See `DISTRIBUTION_SETUP.txt` and `PRODUCTION_RELEASE.md`.

## Local verification

```bash
npm ci
npm run build
```

Copy `.env.example` to `.env.local` and provide real development credentials. Never commit `.env*` files or expose service-role, OAuth-client, Stripe, distributor, or session secrets.

## Database safety

Do not reset production. On an existing project, review and apply only the additive migrations that are still pending:

- `supabase/v9_pro_upgrade.sql`
- `supabase/v10_distribution.sql`
- `supabase/v11_security_hardening.sql`

Apply migrations in staging first and take a production backup. Existing beats, users, purchases, and Storage objects are not recreated by these migrations.

## Owner safety

Public signup and OAuth never grant `owner`, even when an email matches a configured value. Existing database roles are preserved. If a project has no owner, assign the legitimate account by its verified `app_users.id` in a reviewed SQL transaction as documented in `PRODUCTION_RELEASE.md`; never use email-based automatic promotion.
