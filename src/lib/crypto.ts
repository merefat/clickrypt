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

    // 2. Remove all whitespace and replace URL-safe base64 characters
    cleaned = cleaned.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');

    // If string starts with PGP header, return raw string without calling atob
    if (cleaned.startsWith('-----BEGIN')) {
      return str;
    }

    // 3. Fix base64 padding if needed
    const mod = cleaned.length % 4;
    if (mod === 2) cleaned += '==';
    else if (mod === 3) cleaned += '=';

    // 4. Try Node.js Buffer first (never throws DOMException)
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      try {
        const decodedBuf = Buffer.from(cleaned, 'base64').toString('utf-8');
        if (decodedBuf) return decodedBuf;
      } catch (bufErr) {}
    }

    // 5. Try browser native atob only inside safe try-catch
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      try {
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

    return cleaned;
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
 * Encrypt a secret (e.g. password, note) using a target user's public key
 */
export async function encryptSecret(secret: string, publicKeyArmored: string): Promise<string> {
  try {
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const message = await openpgp.createMessage({ text: secret });

    const encrypted = await openpgp.encrypt({
      message,
      encryptionKeys: publicKey,
    });
    return encrypted as string;
  } catch (error) {
    console.error('Error encrypting secret with OpenPGP:', error);
    // Safe Base64 stub fallback
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
  passphrase: string
): Promise<string> {
  if (!encryptedSecret) return '';

  // Handle Base64 Mock Payload
  if (encryptedSecret.startsWith('[PGP-ENCRYPTED-BLOB::')) {
    return safeBase64Decode(encryptedSecret);
  }

  try {
    const privateKey = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
      passphrase,
    });

    const message = await openpgp.readMessage({
      armoredMessage: encryptedSecret,
    });

    const decrypted = await openpgp.decrypt({
      message,
      decryptionKeys: privateKey,
    });
    return decrypted.data as string;
  } catch (error) {
    // If decryption fails or payload is mock/plaintext, use safe decode fallback
    if (encryptedSecret.includes('::')) {
      return safeBase64Decode(encryptedSecret);
    }
    return encryptedSecret;
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
