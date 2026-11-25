import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';
import { isUuid } from '@/lib/api-security';
import { validStripeSignature } from '@/lib/stripe-security';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const raw = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  if (!validStripeSignature(raw, signature, secret)) return NextResponse.json({ error: 'bad_signature' }, { status: 400 });

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session = event?.data?.object;
    const orderId = session?.metadata?.order_id || session?.client_reference_id;
    if (session?.payment_status === 'paid' && isUuid(orderId) && typeof session.id === 'string') {
      const db = adminDb();
      const { data: order, error } = await db.from('orders')
        .select('id,status,total_cents,provider_ref')
        .eq('id', orderId)
        .eq('provider', 'stripe')
        .maybeSingle();
      if (error) return NextResponse.json({ error: 'database_error' }, { status: 500 });
      if (order && order.status === 'pending' && order.provider_ref === session.id && order.total_cents === session.amount_total) {
        const { error: updateError } = await db.from('orders').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        }).eq('id', order.id).eq('status', 'pending').eq('provider_ref', session.id);
        if (updateError) return NextResponse.json({ error: 'database_error' }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ received: true });
}
