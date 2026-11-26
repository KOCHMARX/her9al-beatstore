// Testable route cores for the beat-store free-download path.
// These functions accept injected DB/session/fetch dependencies so route behaviour can be
// proven with mocks; the Next.js route files only adapt the result to NextResponse.

import { checkoutLicenseRejection } from './beatstore-policy.ts';
import { canViewAdmin } from './role-policy.ts';

export type RouteResult = { status: number; body: any };
export type RouteUser = { id: string; role?: unknown; email?: string | null } | null;
export type FetchLike = (input: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

// Empty price fields stay license-free. A present numeric 0 is an intentional free license.
export function enteredPriceCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.max(0, Math.min(100_000_000, Math.round(amount * 100)));
}

function beatFromLicense(license: any) {
  return Array.isArray(license?.beat) ? license.beat[0] : license?.beat;
}

export async function claimFreeLicense(input: {
  db: any;
  user: RouteUser;
  body: unknown;
}): Promise<RouteResult> {
  if (!input.user) return { status: 401, body: { error: 'login_required' } };

  const licenseId = (input.body as any)?.license_id;
  if (!isUuidLike(licenseId)) return { status: 400, body: { error: 'Invalid license.' } };

  const { data: license, error } = await input.db.from('licenses')
    .select('id,beat_id,price_cents,active,beat:beats(id,published,master_path)')
    .eq('id', licenseId)
    .eq('active', true)
    .maybeSingle();
  if (error) return { status: 500, body: { error: 'Could not start the free download.' } };
  if (!license) return { status: 404, body: { error: 'license_not_found' } };

  const price = Number((license as any).price_cents);
  if (!Number.isInteger(price) || price < 0) return { status: 400, body: { error: 'Invalid license.' } };
  if (price !== 0) return { status: 403, body: { error: 'not_free' } };

  const beat = beatFromLicense(license);
  if (!beat || beat.published !== true) return { status: 409, body: { error: 'beat_unavailable' } };
  if (!text((beat as any).master_path, 500)) return { status: 409, body: { error: 'master_unavailable' } };

  // Idempotency: a paid-order item already owned by this user is the delivery entitlement.
  const { data: owned, error: ownedError } = await input.db.from('order_items')
    .select('id,order:orders!inner(user_id,status)')
    .eq('license_id', licenseId)
    .eq('order.user_id', input.user.id)
    .eq('order.status', 'paid')
    .limit(1);
  if (ownedError) return { status: 500, body: { error: 'Could not check your library.' } };
  if (owned?.length) return { status: 200, body: { item_id: owned[0].id, existing: true } };

  const { data: order, error: orderError } = await input.db.from('orders').insert({
    user_id: input.user.id,
    status: 'paid',
    provider: 'free',
    total_cents: 0,
  }).select('*').single();
  if (orderError || !order) return { status: 500, body: { error: 'Could not start the free download.' } };

  const { data: item, error: itemError } = await input.db.from('order_items').insert({
    order_id: order.id,
    beat_id: (license as any).beat_id,
    license_id: (license as any).id,
    price_cents: 0,
  }).select('id').single();
  if (itemError || !item) {
    await input.db.from('orders').delete().eq('id', order.id);
    return { status: 500, body: { error: 'Could not start the free download.' } };
  }

  return { status: 200, body: { item_id: item.id } };
}

export async function createStaffLicense(input: {
  db: any;
  user: RouteUser;
  body: unknown;
}): Promise<RouteResult> {
  if (!input.user) return { status: 401, body: { error: 'unauthorized' } };
  if (!canViewAdmin(input.user.role)) return { status: 403, body: { error: 'forbidden' } };

  const b = (input.body || {}) as any;
  if (!isUuidLike(b.beat_id)) return { status: 400, body: { error: 'Invalid beat.' } };
  const name = text(b.name, 80);
  const fileFormat = text(b.file_format, 80);
  if (!name || !fileFormat) return { status: 400, body: { error: 'Name and file format are required.' } };
  const price = b.price;
  if (!Number.isInteger(price) || price < 0 || price > 100_000_000) {
    return { status: 400, body: { error: 'Price must be an integer amount in cents, zero or more.' } };
  }

  const { data: beat, error: beatError } = await input.db.from('beats')
    .select('id').eq('id', b.beat_id).maybeSingle();
  if (beatError) return { status: 500, body: { error: 'Could not load beat.' } };
  if (!beat) return { status: 404, body: { error: 'Beat not found.' } };

  const { data: existing, error: existingError } = await input.db.from('licenses')
    .select('id,name').eq('beat_id', b.beat_id).eq('active', true);
  if (existingError) return { status: 500, body: { error: 'Could not check licenses.' } };
  const duplicate = (existing || []).some((row: any) => text(row.name, 80).toLowerCase() === name.toLowerCase());
  if (duplicate) return { status: 409, body: { error: 'An active license with that name already exists.' } };

  const { data, error } = await input.db.from('licenses').insert({
    beat_id: b.beat_id,
    name,
    price_cents: price,
    file_format: fileFormat,
    active: true,
  }).select('*').single();
  if (error || !data) return { status: 500, body: { error: 'Could not create license.' } };
  return { status: 201, body: { license: data } };
}

async function resolveCheckoutLicense(db: any, licenseId: unknown): Promise<RouteResult> {
  if (!isUuidLike(licenseId)) return { status: 400, body: { error: 'Invalid license.' } };

  const { data: license, error } = await db.from('licenses')
    .select('id,name,price_cents,beat_id,is_exclusive,active,beat:beats(title,published,master_path)')
    .eq('id', licenseId)
    .eq('active', true)
    .maybeSingle();
  if (error) return { status: 500, body: { error: 'Could not prepare checkout.' } };

  const rejection = checkoutLicenseRejection(license);
  if (rejection) {
    if (rejection === 'license_not_found') return { status: 404, body: { error: rejection } };
    if (rejection === 'beat_unavailable') return { status: 409, body: { error: 'This beat is not available for purchase.' } };
    return { status: 400, body: { error: 'Invalid license.' } };
  }
  if (Number((license as any).price_cents) <= 0) {
    return { status: 400, body: { error: 'free_license_use_claim' } };
  }
  return { status: 200, body: { license } };
}

export async function handleCheckout(input: {
  db: any;
  user: RouteUser;
  body: unknown;
  stripeKey?: string | null;
  fetchImpl?: FetchLike;
  origin: string;
  storeCurrency?: string | null;
}): Promise<RouteResult> {
  if (!input.user) return { status: 401, body: { error: 'login_required' } };

  const resolved = await resolveCheckoutLicense(input.db, (input.body as any)?.license_id);
  if (resolved.status !== 200) return resolved;
  const license = resolved.body.license as any;

  if (!String(input.stripeKey || '').trim()) {
    return { status: 503, body: { error: 'payments_not_configured' } };
  }

  if (license.is_exclusive) {
    const { data: owned } = await input.db.from('order_items')
      .select('id,order:orders!inner(user_id,status)')
      .eq('license_id', license.id)
      .eq('order.user_id', input.user.id)
      .eq('order.status', 'paid')
      .limit(1);
    if (owned?.length) return { status: 409, body: { error: 'You already own this exclusive license.' } };
  }

  const { data: order, error } = await input.db.from('orders').insert({
    user_id: input.user.id,
    status: 'pending',
    provider: 'stripe',
    total_cents: license.price_cents,
  }).select('*').single();
  if (error || !order) return { status: 500, body: { error: 'Could not start checkout.' } };

  const { error: itemError } = await input.db.from('order_items').insert({
    order_id: order.id,
    beat_id: license.beat_id,
    license_id: license.id,
    price_cents: license.price_cents,
  });
  if (itemError) {
    await input.db.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    return { status: 500, body: { error: 'Could not start checkout.' } };
  }

  const relatedBeat = beatFromLicense(license);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${input.origin}/library?paid=1`);
  params.set('cancel_url', `${input.origin}/beats?cancelled=1`);
  params.set('client_reference_id', order.id);
  params.set('customer_email', input.user.email || '');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', input.storeCurrency || 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(license.price_cents));
  params.set('line_items[0][price_data][product_data][name]', `${relatedBeat?.title || 'HER9AL Beat'} — ${license.name}`);
  params.set('metadata[order_id]', order.id);

  const fetchImpl = input.fetchImpl || fetch;
  const sr = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${String(input.stripeKey)}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
    cache: 'no-store',
  });
  const s = await sr.json();
  if (!sr.ok || !s.url) {
    await input.db.from('order_items').delete().eq('order_id', order.id);
    await input.db.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    return { status: 502, body: { error: 'Payment could not be started.' } };
  }
  await input.db.from('orders').update({ provider_ref: s.id }).eq('id', order.id);
  return { status: 200, body: { url: s.url } };
}

export async function downloadMaster(input: {
  db: any;
  user: RouteUser;
  itemId: unknown;
}): Promise<RouteResult> {
  if (!input.user) return { status: 401, body: { error: 'unauthorized' } };
  if (!isUuidLike(input.itemId)) return { status: 400, body: { error: 'invalid item' } };

  const { data, error } = await input.db.from('order_items')
    .select('id,beat:beats(master_path),order:orders!inner(user_id,status)')
    .eq('id', input.itemId)
    .eq('order.user_id', input.user.id)
    .eq('order.status', 'paid')
    .single();
  if (error || !data) return { status: 404, body: { error: 'not found' } };

  const beat = beatFromLicense(data);
  const path = text((beat as any)?.master_path, 500);
  if (!path) return { status: 404, body: { error: 'master unavailable' } };

  const { data: signed, error: signedError } = await input.db.storage
    .from('beat-masters').createSignedUrl(path, 60);
  if (signedError || !signed?.signedUrl) return { status: 500, body: { error: 'download unavailable' } };
  return { status: 302, body: { signedUrl: signed.signedUrl } };
}
