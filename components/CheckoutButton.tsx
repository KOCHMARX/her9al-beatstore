'use client';

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

export default function CheckoutButton({ licenseId }: { licenseId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ license_id: licenseId }),
      });
      const j = await r.json();
      if (r.status === 401) {
        location.href = '/login';
        return;
      }
      if (j.url) {
        location.href = j.url;
        return;
      }
      setError(j.error === 'payments_not_configured' ? 'Card payments are not configured yet.' : (j.error || 'Checkout failed.'));
    } catch {
      setError('Checkout failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="primary checkout-pay" onClick={go} disabled={busy}>
        {busy ? <Loader2 className="spin" size={18} /> : <CreditCard size={18} />}
        {busy ? 'Opening secure checkout…' : 'Pay securely by card'}
      </button>
      {error && <p className="checkout-error">{error}</p>}
    </>
  );
}
