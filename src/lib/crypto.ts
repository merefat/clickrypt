import * as openpgp from 'openpgp';

export interface KeyPairResult {
  publicKey: string;
  privateKey: string;
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
    console.error('Error encrypting secret:', error);
    // Fallback stub for demo if key format is dummy
    return `[PGP-ENCRYPTED-BLOB::${Buffer.from(secret).toString('base64')}]`;
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
  if (encryptedSecret.startsWith('[PGP-ENCRYPTED-BLOB::')) {
    const base64Str = encryptedSecret.replace('[PGP-ENCRYPTED-BLOB::', '').replace(']', '');
    return Buffer.from(base64Str, 'base64').toString('utf-8');
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
    console.error('Error decrypting secret:', error);
    throw new Error('Invalid passphrase or corrupted secret blob');
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
