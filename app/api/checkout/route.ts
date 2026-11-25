import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { appOrigin, isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'checkout-create', limit: 10, windowSeconds: 600, identifier: user.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.license_id)) return NextResponse.json({ error: 'license_not_found' }, { status: 404 });

  const db = adminDb();
  const { data: license, error: licenseError } = await db.from('licenses')
    .select('id,name,price_cents,beat_id,beat:beats(id,title,published,master_path)')
    .eq('id', body.license_id)
    .eq('active', true)
    .maybeSingle();
  const beat = (license as any)?.beat;
  if (licenseError || !license || !beat?.published || !beat?.master_path || !Number.isInteger(license.price_cents) || license.price_cents <= 0) {
    return NextResponse.json({ error: 'license_not_found' }, { status: 404 });
  }

  const currency = (process.env.STORE_CURRENCY || 'usd').trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });

  const { data: order, error: orderError } = await db.from('orders').insert({
    user_id: user.id,
    status: 'pending',
    provider: 'stripe',
    total_cents: license.price_cents,
  }).select('id').single();
  if (orderError || !order) return NextResponse.json({ error: 'checkout_unavailable' }, { status: 500 });

  const { error: itemError } = await db.from('order_items').insert({
    order_id: order.id,
    beat_id: license.beat_id,
    license_id: license.id,
    price_cents: license.price_cents,
  });
  if (itemError) {
    await db.from('orders').update({ status: 'cancelled' }).eq('id', order.id).eq('status', 'pending');
    return NextResponse.json({ error: 'checkout_unavailable' }, { status: 500 });
  }

  const origin = appOrigin(req);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${origin}/library?paid=1`);
  params.set('cancel_url', `${origin}/beats?cancelled=1`);
  params.set('client_reference_id', order.id);
  if (user.email) params.set('customer_email', user.email);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', currency);
  params.set('line_items[0][price_data][unit_amount]', String(license.price_cents));
  params.set('line_items[0][price_data][product_data][name]', `${beat.title || 'HER9AL Beat'} — ${license.name}`.slice(0, 250));
  params.set('metadata[order_id]', order.id);

  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${stripeKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': order.id,
      },
      body: params,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const session = await stripeResponse.json() as { id?: string; url?: string };
    if (!stripeResponse.ok || !session.id || !session.url || new URL(session.url).hostname !== 'checkout.stripe.com') {
      await db.from('orders').update({ status: 'cancelled' }).eq('id', order.id).eq('status', 'pending');
      return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
    }
    const { error: referenceError } = await db.from('orders').update({ provider_ref: session.id }).eq('id', order.id).eq('status', 'pending');
    if (referenceError) {
      return NextResponse.json({ error: 'checkout_unavailable' }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch {
    await db.from('orders').update({ status: 'cancelled' }).eq('id', order.id).eq('status', 'pending');
    return NextResponse.json({ error: 'checkout_unavailable' }, { status: 502 });
  }
}
