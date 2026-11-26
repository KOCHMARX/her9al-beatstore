export type CheckoutLicense = {
  id: string;
  beat_id: string;
  name?: string | null;
  price_cents: number;
  active?: boolean | null;
  is_exclusive?: boolean | null;
  beat?: {
    title?: string | null;
    published?: boolean | null;
    master_path?: string | null;
  } | Array<{
    title?: string | null;
    published?: boolean | null;
    master_path?: string | null;
  }> | null;
};

export type PublicationInput = {
  published?: boolean | null;
  price_cents?: number | null;
  master_path?: string | null;
};

export type CatalogLicense = {
  id: string;
  name?: string | null;
  price_cents: number;
  file_format?: string | null;
  active?: boolean | null;
};

// Catalog cards show the cheapest active license, never a deactivated or arbitrary price.
export function visibleCatalogLicense(licenses: readonly CatalogLicense[] | null | undefined): CatalogLicense | null {
  const active = (licenses || []).filter(license => license.active !== false && Number.isFinite(license.price_cents));
  if (!active.length) return null;
  return active.reduce((cheapest, license) => license.price_cents < cheapest.price_cents ? license : cheapest);
}

// A published paid beat without a private master would take payment and never deliver the file.
export function publishedBeatRejection(beat: PublicationInput): string | null {
  if (beat.published !== true) return null;
  const price = Number(beat.price_cents ?? 0);
  if (!Number.isFinite(price) || price < 0) return null;
  if (price > 0 && !(beat.master_path || '').trim()) return 'Published paid beats require a private master file.';
  return null;
}

// Checkout must re-validate server-side state even when the page already checked it.
export function checkoutLicenseRejection(license: CheckoutLicense | null | undefined): string | null {
  if (!license) return 'license_not_found';
  if (license.active !== true) return 'license_not_found';
  const beat = Array.isArray(license.beat) ? license.beat[0] : license.beat;
  if (!beat || beat.published !== true) return 'beat_unavailable';
  if (!Number.isInteger(license.price_cents) || license.price_cents < 0) return 'invalid_price';
  if (publishedBeatRejection({
    published: beat.published,
    price_cents: license.price_cents,
    master_path: beat.master_path,
  })) return 'beat_unavailable';
  return null;
}
