# HER9AL Beat Store

A custom producer/artist website inspired by the *flow* of modern beat marketplaces and music discovery platforms, with a HER9AL-specific black / white / neon-red identity.

## Included
- Custom HER9AL homepage and artist profile
- Beat catalog UI + fixed preview player
- Google/Discord login wiring via Supabase
- Admin dashboard UI
- Role model: `owner`, `admin`, `editor`, `customer`
- Supabase/Postgres schema for beats, licenses, orders and users
- Private-master architecture ready for signed download URLs
- Responsive mobile layout

## Run locally
1. Install Node.js 20+.
2. Open this folder in Terminal / PowerShell.
3. Run:
   ```bash
   npm install
   npm run dev
   ```
4. Open `http://localhost:3000`.

## Connect the database
1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose this in browser code)
4. In Supabase Auth > Providers, enable Google and Discord.
5. Add your local URL and production URL to Auth redirect URLs.

## Admins
Use `profiles.role`:
- `owner`: full control, including admin management
- `admin`: manage beats, orders, customers
- `editor`: manage beats only
- `customer`: normal user

For production, protect `/admin` server-side by checking the signed-in user's role before rendering or mutating data.

## Audio security architecture
- Put previews in a public or rate-limited preview bucket.
- Put WAV/stems/masters in a **private** bucket.
- Never send master URLs to the browser before payment is verified.
- After successful payment webhook confirmation, create a short-lived signed URL.
- Add audible preview watermark/tag if desired.

No web app can completely prevent a listener from recording audio that is played on their device, so the safe goal is protecting master-quality files and licensing access.

## Payments
The checkout UI is intentionally left provider-neutral. Connect your chosen payment provider with a server-side webhook. Only mark an order as `paid` after verifying the provider's webhook signature/server confirmation.

## Deploy
Recommended easy path:
1. Push this folder to GitHub.
2. Import repo in Vercel.
3. Add the same environment variables in Vercel.
4. Deploy.
5. Buy/connect a custom domain such as `her9al.com` or another available name.
6. Put the final HTTPS link in YouTube / Instagram / Discord profiles.

## Before launch
- Replace demo beats with real data from Supabase.
- Wire play buttons to real preview files.
- Implement cart + license selection + checkout.
- Add server-side admin guards and storage policies.
- Add payment webhooks and post-purchase signed downloads.

## Vinyl hero
The homepage now includes a rotating vinyl visual using the current featured cover. Replace `/public/her9al-logo.jpg` or pass another cover path to `HeroVinyl` to change the center artwork.

## Fastest free deployment
1. Create a GitHub repository and push this project.
2. Sign in to Vercel with GitHub and import the repository.
3. In Vercel → Project → Settings → Environment Variables, add the values from `.env.example`.
4. Deploy. Vercel will give you a public `*.vercel.app` URL.
5. In Supabase Auth URL settings, add both your production URL and `https://YOUR-DOMAIN/auth/callback` as allowed redirect URLs.
6. Enable Google and/or Discord providers in Supabase Auth and fill their provider credentials.

Do not enable a real payment button until the paid-order confirmation and private master delivery flow are connected. This avoids charging customers before an automated download is available.
