import crypto from 'crypto';

const KEYLEN = 64;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored?: string | null) {
  if (!stored) return false;
  const [kind, salt, encoded] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !encoded) return false;
  try {
    const expected = Buffer.from(encoded, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
