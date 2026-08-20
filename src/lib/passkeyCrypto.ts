type GlobalWithCrypto = { crypto?: Crypto };

const globalCrypto =
  typeof window !== 'undefined' && window.crypto
    ? window.crypto
    : typeof globalThis !== 'undefined'
      ? (globalThis as unknown as GlobalWithCrypto).crypto
      : undefined;

export function toBuffer(base64url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function fromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function stringToBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

function bufferToString(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

function isSubtleSupported(): boolean {
  return !!globalCrypto?.subtle;
}

export function isPasskeyCryptoSupported(): boolean {
  return isSubtleSupported();
}

export function randomBytes(size: number): Uint8Array {
  if (!globalCrypto) {
    throw new Error('Web Crypto is not available.');
  }
  return globalCrypto.getRandomValues(new Uint8Array(size));
}

export function randomBase64Url(size: number): string {
  return fromBuffer(randomBytes(size).buffer as ArrayBuffer);
}

export async function derivePasskeyKey(
  prfOutput: ArrayBuffer,
  salt: ArrayBuffer
): Promise<CryptoKey> {
  if (!globalCrypto) {
    throw new Error('Web Crypto is not available.');
  }
  const imported = await globalCrypto.subtle.importKey(
    'raw',
    prfOutput,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  return globalCrypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('clickrypt-passkey-v1'),
    },
    imported,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWithPasskeyKey(
  plain: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  if (!globalCrypto) {
    throw new Error('Web Crypto is not available.');
  }
  const iv = globalCrypto.getRandomValues(new Uint8Array(12));
  const encrypted = await globalCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    stringToBuffer(plain)
  );
  return {
    ciphertext: fromBuffer(encrypted),
    iv: fromBuffer(iv.buffer),
  };
}

export async function decryptWithPasskeyKey(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  if (!globalCrypto) {
    throw new Error('Web Crypto is not available.');
  }
  const decrypted = await globalCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    key,
    toBuffer(ciphertext)
  );
  return bufferToString(decrypted);
}

export type PasskeyVaultKey = {
  prfInput: string;
  prfSalt: string;
  iv: string;
  encryptedPgpKey: string;
};

export async function decryptPasskeyVault(
  vault: PasskeyVaultKey,
  prfOutput: ArrayBuffer
): Promise<string> {
  const passkeyKey = await derivePasskeyKey(prfOutput, toBuffer(vault.prfSalt));
  return decryptWithPasskeyKey(vault.encryptedPgpKey, vault.iv, passkeyKey);
}
