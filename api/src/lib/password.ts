/**
 * Password hashing with scrypt (node:crypto). Stored format:
 *   "scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>"
 * Never log passwords or hashes.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
// scrypt needs 128 * N * r bytes; give headroom over the 32 MiB default.
const MAXMEM = 64 * 1024 * 1024;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Constant-time check. Malformed stored values simply fail. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  // Only accept sane parameters (a tampered row must not be able to make us burn CPU/memory).
  if (![n, r, p].every(Number.isInteger) || n < 2 || n > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");
  if (salt.length === 0 || expected.length < 16) return false;
  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: Math.max(MAXMEM, 256 * n * r) });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Computed once; compared against when the user does not exist so the response time matches.
let dummyHash: Promise<string> | null = null;

/** Burn the same scrypt work as a real check (for unknown emails). Always false. */
export async function dummyVerify(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
  return false;
}
