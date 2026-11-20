// src/lib/crypto/e2ee.ts
const PBKDF2_ITERATIONS = 310_000; // OWASP recommendation for PBKDF2-HMAC-SHA256

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a fresh 16-byte cryptographic salt for user vault setup.
 */
export function generateEncryptionSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(salt);
}

/**
 * Derives a non-extractable AES-GCM-256 CryptoKey from the user's secret passphrase.
 */
export async function deriveDiaryKey(
  passphrase: string,
  saltBase64: string
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const saltBytes = base64ToBytes(saltBase64);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

/**
 * Encrypts diary title & content JSON in the browser before sending to Supabase.
 */
export async function encryptDiaryEntry(
  payload: { title: string; content: string },
  key: CryptoKey
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
  const encoded = new TextEncoder().encode(JSON.stringify(payload));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    encoded
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Decrypts a single diary row retrieved from Supabase.
 */
export async function decryptDiaryEntry(
  encrypted: EncryptedPayload,
  key: CryptoKey
): Promise<{ title: string; content: string }> {
  const ivBytes = base64ToBytes(encrypted.iv);
  const cipherBytes = base64ToBytes(encrypted.ciphertext);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer },
    key,
    cipherBytes.buffer as ArrayBuffer
  );

  const decoded = new TextDecoder().decode(plainBuffer);
  return JSON.parse(decoded);
}
