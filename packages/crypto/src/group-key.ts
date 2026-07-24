import { base64ToBytes, bytesToBase64, getCrypto, randomBytes, utf8ToBytes } from "./encoding.js";
import { decryptMessage, encryptMessage } from "./messages.js";

export interface GroupKeyRecipient {
  userId: string;
  publicKey: string;
}

export interface EncryptedGroupPayload {
  iv: string;
  ciphertext: string;
}

function toBufferSource(data: Uint8Array): BufferSource {
  return data as any;
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return getCrypto().subtle.importKey(
    "raw",
    toBufferSource(rawKey),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Generates a new 256-bit symmetric key for a group.
 * Returns the raw key as a base64 string.
 */
export async function generateGroupKey(): Promise<string> {
  const bytes = randomBytes(32);
  return bytesToBase64(bytes);
}

/**
 * Wraps a group key with each recipient's OpenPGP public key.
 * Returns a map of userId -> armored PGP ciphertext.
 */
export async function encryptGroupKey(
  groupKey: string,
  recipients: GroupKeyRecipient[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of recipients) {
    out[r.userId] = await encryptMessage(groupKey, [r.publicKey]);
  }
  return out;
}

/**
 * Unwraps an armored PGP-wrapped group key using the recipient's private key.
 */
export async function decryptGroupKey(
  encryptedGroupKey: string,
  privateKeyArmored: string
): Promise<string> {
  const { plaintext } = await decryptMessage(encryptedGroupKey, privateKeyArmored);
  return plaintext;
}

/**
 * Encrypts a plaintext string with the group AES key.
 * Returns the IV and ciphertext as base64.
 */
export async function encryptWithGroupKey(
  plaintext: string,
  groupKey: string
): Promise<EncryptedGroupPayload> {
  const keyBytes = base64ToBytes(groupKey);
  const key = await importAesKey(keyBytes);
  const iv = randomBytes(12);
  const plainBytes = utf8ToBytes(plaintext);
  const ciphertext = new Uint8Array(
    await getCrypto().subtle.encrypt(
      { name: "AES-GCM", iv: iv as any },
      key,
      toBufferSource(plainBytes)
    )
  );
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

/**
 * Decrypts an AES-GCM payload produced by `encryptWithGroupKey`.
 */
export async function decryptWithGroupKey(
  payload: EncryptedGroupPayload,
  groupKey: string
): Promise<string> {
  const keyBytes = base64ToBytes(groupKey);
  const key = await importAesKey(keyBytes);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const plain = new Uint8Array(
    await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(iv) },
      key,
      toBufferSource(ciphertext)
    )
  );
  return new TextDecoder().decode(plain);
}
