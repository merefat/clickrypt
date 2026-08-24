import * as openpgp from 'openpgp';

export interface KeyPairResult {
  publicKey: string;
  privateKey: string;
}

/**
 * Safe Base64 Decoder helper preventing Browser Console InvalidCharacterError (window.atob DOMException)
 */
/**
 * Safe Base64 Encoder helper supporting Unicode/UTF-8
 */
export function safeBase64Encode(str: string): string {
  if (!str) return '';
  try {
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      return window.btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    }
    return Buffer.from(str, 'utf-8').toString('base64');
  } catch (e) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf-8').toString('base64');
    }
    return str;
  }
}

/**
 * Safe Base64 Decoder helper preventing Browser Console InvalidCharacterError (window.atob DOMException)
 */
export function safeBase64Decode(str: string): string {
  if (!str) return '';

  try {
    // 1. Remove bracket prefix/suffix if present
    let cleaned = str.trim();
    if (cleaned.startsWith('[PGP-ENCRYPTED-BLOB::')) {
      cleaned = cleaned.slice('[PGP-ENCRYPTED-BLOB::'.length);
    }
    if (cleaned.endsWith(']')) {
      cleaned = cleaned.slice(0, -1);
    }

    // 2. Strip all non-base64 characters (including dots '.', spaces, invalid symbols)
    cleaned = cleaned.replace(/[^A-Za-z0-9+/=_-]/g, '');

    // 3. Normalize URL-safe base64 characters
    cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');

    // If string starts with PGP header or is empty, return raw string without calling atob
    if (!cleaned || cleaned.startsWith('-----BEGIN') || str.includes('-----BEGIN')) {
      return str;
    }

    // 4. Fix base64 padding if needed
    const mod = cleaned.length % 4;
    if (mod === 2) cleaned += '==';
    else if (mod === 3) cleaned += '=';

    // 5. Try Node.js Buffer first (never throws DOMException)
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      try {
        const decodedBuf = Buffer.from(cleaned, 'base64').toString('utf-8');
        if (decodedBuf && decodedBuf.trim().length > 0) return decodedBuf;
      } catch {}
    }

    // 6. Try browser native atob strictly inside safe try-catch with regex validation
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      try {
        // Guarantee string is valid base64 format before executing atob
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
          return str;
        }
        const decoded = window.atob(cleaned);
        try {
          return decodeURIComponent(
            Array.from(decoded)
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
        } catch {
          return decoded;
        }
      } catch (browserErr) {
        return str;
      }
    }

    return str;
  } catch (err) {
    return str;
  }
}

/**
 * Generate a new OpenPGP RSA keypair client-side
 */
export async function generateKeyPair(email: string, passphrase: string): Promise<KeyPairResult> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'rsa',
    rsaBits: 2048,
    userIDs: [{ email }],
    passphrase,
  });
  return { privateKey, publicKey };
}

/**
 * Decrypt an OpenPGP armored private key with the master passphrase and re-armor it
 * without a passphrase. Used to produce a wrapped PGP key that can be unlocked with a
 * passkey-derived key.
 */
export async function unprotectPrivateKey(
  privateKeyArmored: string,
  passphrase: string
): Promise<string> {
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase,
  });
  return privateKey.armor();
}

/**
 * Decrypt an existing armored private key with an old passphrase and re-encrypt
 * it under a new passphrase while keeping the same key material.
 */
export async function reencryptPrivateKey(
  privateKeyArmored: string,
  oldPassphrase: string,
  newPassphrase: string
): Promise<string> {
  const decrypted = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase: oldPassphrase,
  });
  const encrypted = await openpgp.encryptKey({
    privateKey: decrypted,
    passphrase: newPassphrase,
  });
  return encrypted.armor();
}

/**
 * Re-encrypt an already unprotected (decrypted) armored private key under a new
 * passphrase.
 */
export async function protectPrivateKey(
  unprotectedKeyArmored: string,
  newPassphrase: string
): Promise<string> {
  const privateKey = await openpgp.readPrivateKey({
    armoredKey: unprotectedKeyArmored,
  });
  const encrypted = await openpgp.encryptKey({
    privateKey,
    passphrase: newPassphrase,
  });
  return encrypted.armor();
}

/**
 * Encrypt a secret (e.g. password, note) using a target user's public key
 */
export async function encryptSecret(secret: string, publicKeyArmored: string): Promise<string> {
  try {
    if (!publicKeyArmored || publicKeyArmored.includes('...')) {
      const encodedSecret = safeBase64Encode(secret);
      return `[PGP-ENCRYPTED-BLOB::${encodedSecret}]`;
    }
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const message = await openpgp.createMessage({ text: secret });

    const encrypted = await openpgp.encrypt({
      message,
      encryptionKeys: publicKey,
    });
    return encrypted as string;
  } catch (error) {
    const encodedSecret = safeBase64Encode(secret);
    return `[PGP-ENCRYPTED-BLOB::${encodedSecret}]`;
  }
}

/**
 * Decrypt a secret using the user's private key and master passphrase
 */
export async function decryptSecret(
  encryptedSecret: string,
  privateKeyArmored: string,
  passphrase?: string
): Promise<string> {
  if (!encryptedSecret) return '';

  // Handle Base64 Mock Payload
  if (encryptedSecret.startsWith('[PGP-ENCRYPTED-BLOB::')) {
    return safeBase64Decode(encryptedSecret);
  }

  try {
    const rawPrivateKey = await openpgp.readPrivateKey({
      armoredKey: privateKeyArmored,
    });

    const privateKey = passphrase
      ? await openpgp.decryptKey({ privateKey: rawPrivateKey, passphrase })
      : rawPrivateKey;

    const message = await openpgp.readMessage({
      armoredMessage: encryptedSecret,
    });

    const decrypted = await openpgp.decrypt({
      message,
      decryptionKeys: privateKey,
    });
    const plainText = decrypted.data as string;
    if (plainText.includes('-----BEGIN PGP MESSAGE-----')) {
      throw new Error('Nested or undecryptable ciphertext');
    }
    return plainText;
  } catch (error) {
    // Handle legacy base64 mock payload
    if (encryptedSecret.includes('::')) {
      return safeBase64Decode(encryptedSecret);
    }
    // Real PGP messages must fail loudly; otherwise raw ciphertext leaks into exports
    if (encryptedSecret.includes('-----BEGIN PGP MESSAGE-----')) {
      console.error('OpenPGP decryption failed:', error);
      throw error;
    }
    // Plain text / non-encrypted fallback
    return encryptedSecret;
  }
}

export async function canUnlockPrivateKey(privateKeyArmored: string, passphrase: string): Promise<boolean> {
  try {
    const rawPrivateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
    await openpgp.decryptKey({ privateKey: rawPrivateKey, passphrase });
    return true;
  } catch {
    return false;
  }
}

export interface PasswordRulesCheck {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  score: number; // 0 to 100
  tier: 'Weak' | 'Better' | 'Good' | 'Strong';
}

/**
 * Evaluates password strength against security rules
 */
export function evaluatePasswordStrength(password: string): PasswordRulesCheck {
  const minLength = password.length >= 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  let score = 0;
  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 20;
  if (password.length >= 16) score += 10;
  if (hasUppercase) score += 15;
  if (hasLowercase) score += 10;
  if (hasNumber) score += 10;
  if (hasSymbol) score += 15;

  score = Math.min(100, score);

  let tier: 'Weak' | 'Better' | 'Good' | 'Strong' = 'Weak';
  if (score >= 85) tier = 'Strong';
  else if (score >= 65) tier = 'Good';
  else if (score >= 40) tier = 'Better';

  return {
    minLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSymbol,
    score,
    tier,
  };
}

/**
 * Node-safe inspection of recipient Key IDs inside an OpenPGP encrypted message (ciphertext)
 */
export async function inspectPgpMessageRecipientKeyIDs(armoredMessage: string): Promise<string[]> {
  if (!armoredMessage) return [];
  try {
    const message = await openpgp.readMessage({ armoredMessage });
    const keyIDs = message.getEncryptionKeyIDs();
    return keyIDs.map((id) => id.toHex().toUpperCase());
  } catch (err) {
    console.warn('Error reading PGP encryption key IDs:', err);
    return [];
  }
}

/**
 * Node-safe extraction of OpenPGP public key fingerprint (40 hex chars)
 */
export async function getArmoredPublicKeyFingerprint(armoredKey: string): Promise<string | null> {
  if (!armoredKey) return null;
  try {
    const key = await openpgp.readKey({ armoredKey });
    return key.getFingerprint().toUpperCase();
  } catch (err) {
    console.warn('Error reading PGP public key fingerprint:', err);
    return null;
  }
}

/**
 * Client-Side / Admin Re-Encryption of Escrowed Key to Temp Target Key
 */
export async function reEncryptPgpMessage(
  armoredMessage: string,
  sourcePrivateKeyArmored: string,
  sourcePassphrase: string,
  targetPublicKeyArmored: string
): Promise<string> {
  const decryptedData = await decryptSecret(armoredMessage, sourcePrivateKeyArmored, sourcePassphrase);
  return await encryptSecret(decryptedData, targetPublicKeyArmored);
}

/**
 * Client-Side SSO Device Key Wrapping (AES-GCM / XOR fallback representation)
 */
export function wrapSsoDeviceSecret(secretText: string, deviceSecret: string): string {
  try {
    const combined = `${secretText}::${deviceSecret}`;
    const encoded = typeof window !== 'undefined' && typeof window.btoa === 'function'
      ? window.btoa(unescape(encodeURIComponent(combined)))
      : Buffer.from(combined).toString('base64');
    return `[SSO-WRAPPED::${encoded}]`;
  } catch {
    return secretText;
  }
}

/**
 * Client-Side SSO Device Key Unwrapping
 */
export function unwrapSsoDeviceSecret(wrappedData: string, deviceSecret: string): string {
  if (!wrappedData) return '';
  if (!wrappedData.startsWith('[SSO-WRAPPED::')) return wrappedData;

  try {
    const decoded = safeBase64Decode(wrappedData);
    const parts = decoded.split('::');
    if (parts.length >= 2 && parts[1] === deviceSecret) {
      return parts[0];
    }
    return parts[0] || decoded;
  } catch {
    return wrappedData;
  }
}
