import crypto from 'crypto';

const KEYLEN = 64;

function scrypt(password: string, salt: string, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, length, (error, result) => error ? reject(error) : resolve(result));
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, KEYLEN)).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored?: string | null) {
  if (!stored) return false;
  const [kind, salt, encoded] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !encoded) return false;
  try {
    const expected = Buffer.from(encoded, 'hex');
    const actual = await scrypt(password, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
