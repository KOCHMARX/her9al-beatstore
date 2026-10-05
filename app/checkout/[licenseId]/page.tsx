import { notFound, redirect } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import CheckoutButton from '@/components/CheckoutButton';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ params }: { params: Promise<{ licenseId: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  const { licenseId } = await params;
  const db = adminDb();
  const { data: license } = await db
    .from('licenses')
    .select('id,name,price_cents,file_format,is_exclusive,active,beat:beats(id,title,slug,cover_url,bpm,musical_key,mood,published)')
    .eq('id', licenseId)
    .eq('active', true)
    .maybeSingle();

  const beat: any = (license as any)?.beat;
  if (!license || !beat || !beat.published) notFound();

  return (
    <main>
      <SiteHeader />
      <section className="checkout-shell">
        <div className="checkout-title"><span>SECURE CHECKOUT</span><h1>Complete your purchase.</h1></div>
        <div className="checkout-grid">
          <div className="panel checkout-product">
            <img src={beat.cover_url || '/her9al-logo.jpg'} alt={beat.title} />
            <div><span>BEAT</span><h2>{beat.title}</h2><p>{beat.bpm || '—'} BPM · {beat.musical_key || '—'} · {beat.mood || 'HER9AL'}</p></div>
          </div>
          <div className="panel checkout-summary">
            <h2>Order summary</h2>
            <div className="summary-line"><span>License</span><strong>{license.name}</strong></div>
            <div className="summary-line"><span>Format</span><strong>{license.file_format || 'WAV + MP3'}</strong></div>
            <div className="summary-line total"><span>Total</span><strong>${(license.price_cents / 100).toFixed(2)}</strong></div>
            <CheckoutButton licenseId={license.id} />
            <div className="checkout-trust"><span><LockKeyhole size={15} /> Secure payment</span><span><ShieldCheck size={15} /> Purchase saved to your account</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
