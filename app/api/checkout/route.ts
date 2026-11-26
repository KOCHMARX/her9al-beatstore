import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { appOrigin, isUuid, rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';
import { checkoutLicenseRejection } from '@/lib/beatstore-policy';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  const limited = await rateLimit(req, { action: 'checkout-create', limit: 20, windowSeconds: 3600, identifier: u.id });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const stripe = process.env.STRIPE_SECRET_KEY;
  if (!stripe) return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body.license_id)) return NextResponse.json({ error: 'Invalid license.' }, { status: 400 });

  const db = adminDb();
  const { data: license, error: licenseError } = await db.from('licenses')
    .select('id,name,price_cents,beat_id,is_exclusive,active,beat:beats(title,published,master_path)')
    .eq('id', body.license_id).eq('active', true).maybeSingle();
  if (licenseError) {
    console.error('HER9AL CHECKOUT LICENSE ERROR', { code: licenseError.code });
    return NextResponse.json({ error: 'Could not prepare checkout.' }, { status: 500 });
  }
  const rejection = checkoutLicenseRejection(license);
  if (rejection === 'license_not_found') return NextResponse.json({ error: rejection }, { status: 404 });
  if (rejection === 'invalid_price') return NextResponse.json({ error: 'Invalid license.' }, { status: 400 });
  if (rejection === 'beat_unavailable') return NextResponse.json({ error: 'This beat is not available for purchase.' }, { status: 409 });
  if (!license) return NextResponse.json({ error: 'license_not_found' }, { status: 404 });

  if (license.is_exclusive) {
    const { data: owned } = await db.from('order_items')
      .select('id,order:orders!inner(user_id,status)')
      .eq('license_id', license.id)
      .eq('order.user_id', u.id)
      .eq('order.status', 'paid')
      .limit(1);
    if (owned?.length) return NextResponse.json({ error: 'You already own this exclusive license.' }, { status: 409 });
  }

  const { data: order, error } = await db.from('orders').insert({
    user_id: u.id, status: 'pending', provider: 'stripe', total_cents: license.price_cents,
  }).select('*').single();
  if (error || !order) {
    console.error('HER9AL CHECKOUT ORDER ERROR', { code: error?.code });
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
  const { error: itemError } = await db.from('order_items').insert({
    order_id: order.id, beat_id: license.beat_id, license_id: license.id, price_cents: license.price_cents,
  });
  if (itemError) {
    console.error('HER9AL CHECKOUT ORDER ITEM ERROR', { code: itemError.code });
    await db.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }

  const origin = appOrigin(req);
  const relatedBeat = Array.isArray((license as any).beat) ? (license as any).beat[0] : (license as any).beat;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${origin}/library?paid=1`);
  params.set('cancel_url', `${origin}/beats?cancelled=1`);
  params.set('client_reference_id', order.id);
  params.set('customer_email', u.email || '');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', process.env.STORE_CURRENCY || 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(license.price_cents));
  params.set('line_items[0][price_data][product_data][name]', `${relatedBeat?.title || 'HER9AL Beat'} — ${license.name}`);
  params.set('metadata[order_id]', order.id);

  const sr = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${stripe}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
    cache: 'no-store',
  });
  const s = await sr.json();
  if (!sr.ok || !s.url) {
    await db.from('order_items').delete().eq('order_id', order.id);
    await db.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    console.error('HER9AL CHECKOUT STRIPE ERROR', { status: sr.status });
    return NextResponse.json({ error: 'Payment could not be started.' }, { status: 502 });
  }
  await db.from('orders').update({ provider_ref: s.id }).eq('id', order.id);
  return NextResponse.json({ url: s.url }, { headers: { 'Cache-Control': 'no-store' } });
}
