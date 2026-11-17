/**
 * AES-256-GCM encryption for small secrets stored in the database (the Gmail app password).
 *
 * Key: env ENCRYPTION_KEY (32 bytes as 64 hex chars or base64) when set; otherwise a random key is
 * generated once into api/.data/secret.key (gitignored). Losing that file means stored secrets can
 * no longer be decrypted, and the account has to be connected again.
 *
 * Ciphertext format: "v1:<iv b64>:<tag b64>:<data b64>". Never log plaintext or keys.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// src/lib -> api/  (same depth under dist/)
const DATA_DIR = fileURLToPath(new URL("../../.data/", import.meta.url));
const KEY_FILE = path.join(DATA_DIR, "secret.key");

let cachedKey: Buffer | null = null;

/** Parse a 32-byte key given as 64 hex chars or base64; null when invalid. */
export function parseKey(raw: string): Buffer | null {
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(v)) {
    const b = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (b.length === 32) return b;
  }
  return null;
}

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv && fromEnv.trim()) {
    const k = parseKey(fromEnv);
    if (!k) throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)");
    return (cachedKey = k);
  }
  if (existsSync(KEY_FILE)) {
    const k = parseKey(readFileSync(KEY_FILE, "utf8"));
    if (!k) throw new Error(`Encryption key file is invalid: ${KEY_FILE}`);
    return (cachedKey = k);
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const k = randomBytes(32);
  // "wx": never overwrite a key another process just created.
  try {
    writeFileSync(KEY_FILE, k.toString("hex") + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    try {
      chmodSync(KEY_FILE, 0o600);
    } catch {
      // best effort (no-op on Windows)
    }
    console.log(`[crypto] generated a new encryption key at ${KEY_FILE}`);
    return (cachedKey = k);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      cachedKey = null;
      return loadKey();
    }
    throw err;
  }
}

/** For tests: use an explicit key instead of env / key file. */
export function setEncryptionKeyForTests(key: Buffer | null): void {
  cachedKey = key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unsupported encrypted secret format");
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  try {
    const decipher = createDecipheriv("aes-256-gcm", loadKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key (e.g. .data/secret.key deleted or ENCRYPTION_KEY changed) or tampered data.
    throw new Error("Could not decrypt the stored Gmail app password; reconnect Gmail");
  }
}
