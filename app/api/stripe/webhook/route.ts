import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';
import { validStripeSignature } from '@/lib/stripe-security';
import { paidCheckoutOrderId } from '@/lib/webhook-events';

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
    // Idempotent: a retried/duplicated Stripe event never re-fulfils an already paid order.
    const { error } = await db.from('orders').update({
      status: 'paid',
      provider_ref: typeof (event as any)?.data?.object?.id === 'string' ? (event as any).data.object.id : null,
      paid_at: new Date().toISOString(),
    }).eq('id', orderId).neq('status', 'paid');
    if (error) {
      console.error('HER9AL WEBHOOK FULFILMENT ERROR', { code: error.code });
      return NextResponse.json({ error: 'fulfilment_failed' }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } });
}
