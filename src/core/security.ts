import * as Crypto from 'expo-crypto';

/**
 * Password security.
 * Passwords are NEVER stored as plain text: each user gets a random salt and the password is
 * hashed with an iterated salted SHA-256 digest. On a real backend this layer is replaced by
 * server-side bcrypt/argon2 — the client only ever sends the password, never the hash.
 */
const ITERATIONS = 600;

export async function hashPassword(
  password: string,
  existingSalt?: string,
): Promise<{ salt: string; hash: string }> {
  const salt = existingSalt ?? Crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  let acc = `${password}::${salt}`;
  for (let i = 0; i < ITERATIONS; i++) {
    acc = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, acc);
  }
  return { salt, hash: `s1$${salt}$${acc}` };
}

export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  return hash === storedHash;
}

export const uid = () => Crypto.randomUUID();
