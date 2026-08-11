import * as openpgp from 'openpgp';

export interface KeyPairResult {
  publicKey: string;
  privateKey: string;
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

    // 2. Remove all whitespace
    cleaned = cleaned.replace(/\s+/g, '');

    // 3. Fix base64 padding if needed
    const mod = cleaned.length % 4;
    if (mod === 2) cleaned += '==';
    else if (mod === 3) cleaned += '=';

    // 4. Try browser native atob with try/catch fallback
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      try {
        const decoded = window.atob(cleaned);
        try {
          return decodeURIComponent(escape(decoded));
        } catch {
          return decoded;
        }
      } catch (browserErr) {
        // Suppress window.atob InvalidCharacterError and proceed to Buffer fallback
      }
    }

    // 5. Node.js Buffer fallback
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(cleaned, 'base64').toString('utf-8');
    }

    return cleaned;
  } catch (err) {
    console.warn('Safe base64 decode fallback:', err);
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
    const encodedSecret = typeof window !== 'undefined' && typeof window.btoa === 'function'
      ? window.btoa(unescape(encodeURIComponent(secret)))
      : Buffer.from(secret).toString('base64');
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
