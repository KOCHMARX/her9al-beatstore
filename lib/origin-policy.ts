// Origin policy shared by CSRF checks and redirect construction.
// No wildcards: only the app's own origin and explicitly configured hosts are accepted.
export type OriginPolicyInput = {
  requestOrigin?: string | null;
  host?: string | null;
  proto?: string | null;
  appUrl?: string | null;
  vercelUrl?: string | null;
  vercelBranchUrl?: string | null;
  isProduction?: boolean;
};

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeOrigin(value: unknown, isProduction: boolean): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol === 'http:' && isProduction && !LOOPBACK.has(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function inferOrigin(input: OriginPolicyInput, isProduction: boolean) {
  const host = typeof input.host === 'string' ? input.host.trim() : '';
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) return null;
  const proto = input.proto === 'http' || input.proto === 'https' ? input.proto : 'https';
  return normalizeOrigin(`${proto}://${host}`, isProduction);
}

export function allowedOrigins(input: OriginPolicyInput = {}): string[] {
  const isProduction = input.isProduction === true;
  const origins = new Set<string>();
  const add = (value: unknown) => {
    const origin = normalizeOrigin(value, isProduction);
    if (origin) origins.add(origin);
  };
  add(input.requestOrigin);
  add(inferOrigin(input, isProduction));
  add(input.appUrl);
  add(input.vercelUrl);
  add(input.vercelBranchUrl);
  return [...origins];
}

export function isAllowedOrigin(origin: unknown, input: OriginPolicyInput = {}): boolean {
  if (typeof origin !== 'string' || !origin) return false;
  let normalized: string | null = null;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  return allowedOrigins(input).includes(normalized);
}

export function preferredAppOrigin(input: OriginPolicyInput = {}): string {
  const isProduction = input.isProduction === true;
  const configured = [input.vercelBranchUrl, input.vercelUrl, input.appUrl]
    .map(value => normalizeOrigin(value, isProduction))
    .filter((value): value is string => !!value);
  const requestOrigin = normalizeOrigin(input.requestOrigin, isProduction);
  if (requestOrigin && configured.includes(requestOrigin)) return requestOrigin;
  const inferred = inferOrigin(input, isProduction);
  if (inferred && configured.includes(inferred)) return inferred;
  if (configured.length) return configured[0];
  return requestOrigin || inferred || '';
}

// OAuth redirect URIs must never be derived from an unrecognised Host header.
// Prefer explicit Vercel/APP_URL configuration; allow loopback for local dev only.
export function oauthRedirectOrigin(input: OriginPolicyInput = {}): string | null {
  const isProduction = input.isProduction === true;
  const branch = normalizeOrigin(input.vercelBranchUrl, isProduction);
  const vercel = normalizeOrigin(input.vercelUrl, isProduction);
  const app = normalizeOrigin(input.appUrl, isProduction);
  const configured = [branch, vercel, app].filter((value): value is string => !!value);
  const requestOrigin = normalizeOrigin(input.requestOrigin, isProduction);
  const inferred = inferOrigin(input, isProduction);
  const isLoopback = (origin: string | null) => {
    if (!origin) return false;
    try { return LOOPBACK.has(new URL(origin).hostname.toLowerCase()); } catch { return false; }
  };

  if (requestOrigin && configured.includes(requestOrigin)) return requestOrigin;
  if (inferred && configured.includes(inferred)) return inferred;
  if (branch || vercel) return branch || vercel;
  if (isLoopback(requestOrigin)) return requestOrigin;
  if (isLoopback(inferred)) return inferred;
  if (isLoopback(app)) return app;
  return null;
}
