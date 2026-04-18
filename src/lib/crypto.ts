/**
 * AES-GCM helpers that work in both Node.js 20+ and the workerd runtime via
 * the Web Crypto API (`globalThis.crypto.subtle`).
 *
 * Secrets are encoded as `base64url(iv || ciphertext_with_tag)`. Tokens are
 * hashed with SHA-256 hex.
 */

const ALG = "AES-GCM";
const IV_BYTES = 12;

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBufferSource(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

async function importKey(encryptionKey: string): Promise<CryptoKey> {
  const raw = b64urlDecode(encryptionKey.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"));
  if (raw.byteLength !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes (base64 / base64url).");
  }
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(raw),
    { name: ALG },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecret(plaintext: string, encryptionKey: string): Promise<string> {
  const key = await importKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt(
    { name: ALG, iv: toBufferSource(iv) },
    key,
    toBufferSource(enc)
  );
  const out = new Uint8Array(iv.byteLength + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.byteLength);
  return b64urlEncode(out);
}

export async function decryptSecret(cipher: string, encryptionKey: string): Promise<string> {
  const key = await importKey(encryptionKey);
  const raw = b64urlDecode(cipher);
  if (raw.byteLength < IV_BYTES + 16) {
    throw new Error("Ciphertext too short.");
  }
  const iv = raw.slice(0, IV_BYTES);
  const ct = raw.slice(IV_BYTES);
  const pt = await crypto.subtle.decrypt(
    { name: ALG, iv: toBufferSource(iv) },
    key,
    toBufferSource(ct)
  );
  return new TextDecoder().decode(pt);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    toBufferSource(new TextEncoder().encode(input))
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(prefix = "omm"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}_${b64urlEncode(bytes)}`;
}

export function tokenPrefix(raw: string): string {
  return raw.slice(0, 12);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
