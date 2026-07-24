import * as openpgp from "openpgp";

export interface GeneratedKeyPair {
  /** Armored public key — safe to send to the server. */
  publicKeyArmored: string;
  /** Armored UNENCRYPTED private key — must be wrapped via encryptWithPassphrase before leaving memory. */
  privateKeyArmored: string;
  /** Uppercase hex fingerprint of the primary key. */
  fingerprint: string;
}

export interface KeyGenOptions {
  name: string;
  email: string;
}

/** Generates a Curve25519 OpenPGP key pair, entirely client-side. */
export async function generateKeyPair(
  options: KeyGenOptions
): Promise<GeneratedKeyPair> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519",
    userIDs: [{ name: options.name, email: options.email }],
    format: "object",
  });
  return {
    publicKeyArmored: publicKey.armor(),
    privateKeyArmored: privateKey.armor(),
    fingerprint: publicKey.getFingerprint().toUpperCase(),
  };
}

/** Reads and validates an armored public key, returning its fingerprint. */
export async function readPublicKeyFingerprint(
  publicKeyArmored: string
): Promise<string> {
  const key = await openpgp.readKey({ armoredKey: publicKeyArmored });
  if (key.isPrivate()) {
    throw new Error("Expected a public key but received a private key.");
  }
  return key.getFingerprint().toUpperCase();
}

/** Extracts the armored public key from an armored private key. */
export async function getPublicKeyFromPrivateKey(
  privateKeyArmored: string
): Promise<string> {
  const key = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
  return key.toPublic().armor();
}
