import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';
import { validStripeSignature } from '@/lib/stripe-security';
import { paidCheckoutAmount, paidCheckoutOrderId } from '@/lib/webhook-events';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const raw = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  if (!validStripeSignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 });
  }

  const orderId = paidCheckoutOrderId(event);
  if (orderId) {
    const db = adminDb();
    const { data: order, error: loadError } = await db.from('orders')
      .select('total_cents,status').eq('id', orderId).maybeSingle();
    if (loadError) {
      console.error('HER9AL WEBHOOK ORDER LOOKUP ERROR', { code: loadError.code });
      return NextResponse.json({ error: 'fulfilment_failed' }, { status: 500 });
    }
    if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    const amount = paidCheckoutAmount(event);
    if (amount !== null && amount !== Number(order.total_cents)) {
      console.error('HER9AL WEBHOOK AMOUNT MISMATCH', { code: 'amount_mismatch' });
      return NextResponse.json({ error: 'amount_mismatch' }, { status: 400 });
    }
    // Only a pending order can become paid; paid, cancelled and refunded states are final here.
    if ((order as any).status !== 'pending') return NextResponse.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } });
    const { error } = await db.from('orders').update({
      status: 'paid',
      provider_ref: typeof (event as any)?.data?.object?.id === 'string' ? (event as any).data.object.id : null,
      paid_at: new Date().toISOString(),
    }).eq('id', orderId).eq('status', 'pending');
    if (error) {
      console.error('HER9AL WEBHOOK FULFILMENT ERROR', { code: error.code });
      return NextResponse.json({ error: 'fulfilment_failed' }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } });
}
