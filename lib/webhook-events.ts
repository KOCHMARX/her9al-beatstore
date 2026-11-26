// Stripe webhook event parsing: only a paid checkout for one of our order IDs may fulfil an order.
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function paidCheckoutOrderId(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const candidate = event as {
    type?: unknown;
    data?: { object?: { payment_status?: unknown; client_reference_id?: unknown; metadata?: { order_id?: unknown } } };
  };
  if (candidate.type !== 'checkout.session.completed') return null;
  const session = candidate.data?.object;
  if (!session || session.payment_status !== 'paid') return null;
  const reference = session.metadata?.order_id || session.client_reference_id;
  return typeof reference === 'string' && ORDER_ID.test(reference) ? reference : null;
}
