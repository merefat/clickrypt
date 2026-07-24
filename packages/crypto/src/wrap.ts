import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  getCrypto,
  randomBytes,
  utf8ToBytes,
} from "./encoding.js";
import { deriveKey, generateKdfParams, type KdfParams } from "./kdf.js";

/**
 * A passphrase-encrypted blob (AES-256-GCM with an Argon2id-derived key).
 * This is the format used to protect the user's private key at rest —
 * both server-side (multi-device login) and in the Recovery Kit.
 */
export interface EncryptedBlob {
  version: 1;
  kdf: KdfParams;
  /** Base64-encoded 12-byte AES-GCM IV. */
  iv: string;
  /** Base64-encoded ciphertext (includes GCM auth tag). */
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

/** Encrypts arbitrary text (e.g. an armored private key) under a passphrase. */
export async function encryptWithPassphrase(
  plaintext: string,
  passphrase: string,
  kdfOverrides: Partial<Omit<KdfParams, "salt" | "algorithm">> = {}
): Promise<EncryptedBlob> {
  const kdf = generateKdfParams(kdfOverrides);
  const key = await importAesKey(await deriveKey(passphrase, kdf));
  const iv = randomBytes(12);
  const plaintextBytes = utf8ToBytes(plaintext);
  const ciphertext = new Uint8Array(
    await getCrypto().subtle.encrypt(
      { name: "AES-GCM", iv: iv as any },
      key,
      toBufferSource(plaintextBytes)
    )
  );
  return {
    version: 1,
    kdf,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** Decrypts an EncryptedBlob. Throws on wrong passphrase or tampering. */
export async function decryptWithPassphrase(
  blob: EncryptedBlob,
  passphrase: string
): Promise<string> {
  if (blob.version !== 1) {
    throw new Error(`Unsupported EncryptedBlob version: ${blob.version}`);
  }
  console.log("[decryptWithPassphrase] KDF params:", blob.kdf);
  const derivedKey = await deriveKey(passphrase, blob.kdf);
  console.log("[decryptWithPassphrase] Key derived, length:", derivedKey.length);
  const key = await importAesKey(derivedKey);
  console.log("[decryptWithPassphrase] Key imported successfully");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(base64ToBytes(blob.iv)) },
      key,
      toBufferSource(base64ToBytes(blob.ciphertext))
    );
    console.log("[decryptWithPassphrase] Decryption successful");
  } catch (err) {
    console.error("[decryptWithPassphrase] Decryption failed:", err);
    throw new Error("Decryption failed: wrong passphrase or corrupted data.");
  }
  return bytesToUtf8(new Uint8Array(plaintext));
}
